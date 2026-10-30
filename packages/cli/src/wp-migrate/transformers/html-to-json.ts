/**
 * HTML to JSONB Transformer
 * Converts WordPress post_content (HTML + Gutenberg comments) to structured JSONB
 * Supports both Classic Editor HTML and Gutenberg block comments
 */

export interface GutenbergBlock {
  name: string;
  attributes: Record<string, unknown>;
  innerBlocks: GutenbergBlock[];
  innerHTML?: string;
  innerContent: string[];
}

export interface ClassicContent {
  type: 'classic';
  html: string;
}

export interface StructuredContent {
  blocks: GutenbergBlock[];
  classic?: ClassicContent;
  shortcodes: ShortcodeInstance[];
}

export interface ShortcodeInstance {
  name: string;
  attributes: Record<string, string | boolean>;
  content?: string;
  selfClosing: boolean;
  position: number;
}


// Regex patterns for parsing
const SHORTCODE_REGEX = /\[(\/?)([a-zA-Z0-9_-]+)(?:\s+([^\]]*?))?\]/g;

/**
 * Parse Gutenberg block attributes from JSON string
 */
function parseBlockAttributes(attrString: string): Record<string, unknown> {
  if (!attrString || attrString.trim() === '') return {};
  try {
    return JSON.parse(attrString);
  } catch {
    // If JSON parse fails, return empty object
    return {};
  }
}

/**
 * Parse shortcode attributes string into object
 * Handles: name="value" name='value' name=value boolean_attr
 */
function parseShortcodeAttributes(attrString: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  // Regex to match: key="value" or key='value' or key=value or just key (boolean)
  const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"]+))|([a-zA-Z0-9_-]+)(?=\s|\]|\/?>)/g;
  let match;
  while ((match = attrRegex.exec(attrString)) !== null) {
    if (match[1]) {
      // key="value" or key='value' or key=value
      attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
    } else if (match[5]) {
      // boolean attribute
      attrs[match[5]] = true;
    }
  }
  return attrs;
}

/**
 * Extract shortcodes from HTML content
 */
export function extractShortcodes(html: string): ShortcodeInstance[] {
  const shortcodes: ShortcodeInstance[] = [];
  let match;

  while ((match = SHORTCODE_REGEX.exec(html)) !== null) {
    const [fullMatch, closing, name, attrString] = match;
    const isClosing = closing === '/';
    const isSelfClosing = fullMatch.endsWith('/]') || isClosing;
    const shortcodeName = name ?? 'unknown';

    shortcodes.push({
      name: shortcodeName,
      attributes: parseShortcodeAttributes(attrString ?? ''),
      content: undefined, // Would need more complex parsing for content between opening/closing
      selfClosing: isSelfClosing,
      position: match.index ?? 0,
    });
  }

  return shortcodes;
}

/**
 * Parse Gutenberg block comments from HTML
 * Returns array of block boundaries with parsed attributes
 */
interface BlockBoundary {
  type: 'start' | 'end' | 'void';
  blockName: string;
  attributes: Record<string, unknown>;
  startIndex: number;
  endIndex: number;
  contentStart: number;
  contentEnd: number;
}

function findBlockBoundaries(html: string): BlockBoundary[] {
  const boundaries: BlockBoundary[] = [];

  // Find all block comments (start, end, void)
  const startRegex = /<!--\s*wp:([a-zA-Z0-9\/_-]+)(?:\s+({[\s\S]*?}))?\s*-->/g;
  const endRegex = /<!--\s*\/wp:([a-zA-Z0-9\/_-]+)\s*-->/g;

  let match;

  while ((match = startRegex.exec(html)) !== null) {
    const [fullMatch, blockName, attrString] = match;
    const cleanName = (blockName ?? '').trim();
    const isVoid = cleanName.endsWith(' ');

    boundaries.push({
      type: isVoid ? 'void' : 'start',
      blockName: cleanName.replace(/\s+$/g, ''),
      attributes: parseBlockAttributes(attrString ?? ''),
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
      contentStart: match.index + fullMatch.length,
      contentEnd: match.index + fullMatch.length,
    });
  }

  // Find end comments
  while ((match = endRegex.exec(html)) !== null) {
    const [fullMatch, blockName] = match;
    boundaries.push({
      type: 'end',
      blockName: blockName ?? 'unknown',
      attributes: {},
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
      contentStart: match.index,
      contentEnd: match.index,
    });
  }

  // Sort by position
  boundaries.sort((a, b) => a.startIndex - b.startIndex);

  // Match start/end pairs and calculate content boundaries
  const stack: BlockBoundary[] = [];
  for (const boundary of boundaries) {
    if (boundary.type === 'start') {
      stack.push(boundary);
    } else if (boundary.type === 'end') {
      const start = stack.pop();
      if (start && start.blockName === boundary.blockName) {
        start.contentEnd = boundary.contentStart;
      }
    }
    // Void blocks don't need matching
  }

  return boundaries;
}

/**
 * Build block tree from boundaries
 */
function buildBlockTree(html: string, boundaries: BlockBoundary[]): GutenbergBlock[] {
  const roots: GutenbergBlock[] = [];
  const stack: { block: GutenbergBlock; endIndex: number }[] = [];

  let lastEnd = 0;

  for (const boundary of boundaries) {
    // Handle content between blocks as freeform/paragraph
    if (boundary.startIndex > lastEnd) {
      const interstitial = html.slice(lastEnd, boundary.startIndex).trim();
      if (interstitial) {
        const freeformBlock: GutenbergBlock = {
          name: 'core/freeform',
          attributes: {},
          innerBlocks: [],
          innerHTML: interstitial,
          innerContent: [interstitial],
        };
        const parentBlock = stack[stack.length - 1];
        if (parentBlock) {
          parentBlock.block.innerBlocks.push(freeformBlock);
        } else {
          roots.push(freeformBlock);
        }
      }
    }

    if (boundary.type === 'start') {
      const block: GutenbergBlock = {
        name: boundary.blockName,
        attributes: boundary.attributes,
        innerBlocks: [],
        innerContent: [],
      };

      const parentBlock = stack[stack.length - 1];
        if (parentBlock) {
          parentBlock.block.innerBlocks.push(block);
        } else {
        roots.push(block);
      }

      stack.push({ block, endIndex: boundary.contentEnd });
    } else if (boundary.type === 'end') {
      const popped = stack.pop();
      if (popped) {
        // Extract inner HTML content
        const firstInnerBlock = popped.block.innerBlocks[0];
        const innerHTML = html.slice(firstInnerBlock && firstInnerBlock.innerHTML
          ? firstInnerBlock.innerHTML.length
          : boundary.startIndex, boundary.contentStart);
        popped.block.innerHTML = innerHTML;
        lastEnd = boundary.endIndex;
      }
    } else if (boundary.type === 'void') {
      // Void block (self-closing like <hr>, <img> in block form)
      const block: GutenbergBlock = {
        name: boundary.blockName,
        attributes: boundary.attributes,
        innerBlocks: [],
        innerContent: [],
      };
      const parentBlock = stack[stack.length - 1];
      if (parentBlock) {
        parentBlock.block.innerBlocks.push(block);
      } else {
        roots.push(block);
      }
      lastEnd = boundary.endIndex;
    }
  }

  // Handle trailing content
  if (lastEnd < html.length) {
    const trailing = html.slice(lastEnd).trim();
    if (trailing) {
      const freeformBlock: GutenbergBlock = {
        name: 'core/freeform',
        attributes: {},
        innerBlocks: [],
        innerHTML: trailing,
        innerContent: [trailing],
      };
      roots.push(freeformBlock);
    }
  }

  return roots;
}

/**
 * Main transformation function: HTML string → StructuredContent
 */
export function htmlToStructuredContent(html: string): StructuredContent {
  if (!html || html.trim() === '') {
    return { blocks: [], shortcodes: [] };
  }

  // Check if content has Gutenberg block comments
  const hasGutenbergBlocks = /<!--\s*wp:/.test(html);

  if (!hasGutenbergBlocks) {
    // Classic Editor content
    const shortcodes = extractShortcodes(html);
    return {
      blocks: [],
      classic: { type: 'classic', html },
      shortcodes,
    };
  }

  // Gutenberg content
  const boundaries = findBlockBoundaries(html);
  const blocks = buildBlockTree(html, boundaries);
  const shortcodes = extractShortcodes(html);

  // Also check for classic content mixed in (shouldn't happen in pure Gutenberg)
  // but we capture any non-block HTML as freeform blocks already

  return { blocks, shortcodes };
}

/**
 * Convert StructuredContent to OkCMS body JSONB format
 */
export function structuredContentToBody(content: StructuredContent): Record<string, unknown> {
  if (content.classic) {
    return {
      type: 'classic',
      html: content.classic.html,
      shortcodes: content.shortcodes.map(sc => ({
        name: sc.name,
        attributes: sc.attributes,
        selfClosing: sc.selfClosing,
      })),
    };
  }

  return {
    type: 'blocks',
    blocks: content.blocks.map(block => serializeBlock(block)),
    shortcodes: content.shortcodes.map(sc => ({
      name: sc.name,
      attributes: sc.attributes,
      selfClosing: sc.selfClosing,
    })),
  };
}

function serializeBlock(block: GutenbergBlock): Record<string, unknown> {
  return {
    name: block.name,
    attributes: block.attributes,
    innerBlocks: block.innerBlocks.map(serializeBlock),
    innerHTML: block.innerHTML,
    innerContent: block.innerContent,
  };
}

/**
 * Convert OkCMS body JSONB back to HTML (for rendering)
 */
export function bodyToHtml(body: Record<string, unknown>): string {
  if (!body || typeof body !== 'object') return '';

  const bodyType = body['type'] as string;
  if (bodyType === 'classic') {
    return (body['html'] as string) ?? '';
  }

  if (bodyType === 'blocks' && Array.isArray(body['blocks'])) {
    return (body['blocks'] as Record<string, unknown>[]).map(block => renderBlock(block)).join('');
  }

  // Fallback: try to render as blocks array directly
  if (Array.isArray(body)) {
    return body.map(block => renderBlock(block as Record<string, unknown>)).join('');
  }

  return '';
}

function renderBlock(block: Record<string, unknown>): string {
  const name = block['name'] as string;
  const attributes = (block['attributes'] as Record<string, unknown>) ?? {};
  const innerBlocks = (block['innerBlocks'] as Record<string, unknown>[]) ?? [];
  const innerHTML = block['innerHTML'] as string;
  const innerContent = (block['innerContent'] as string[]) ?? [];

  // For core blocks, we can render HTML from attributes
  // For unknown blocks, fall back to innerHTML or innerContent
  const renderedInner = innerBlocks.length > 0
    ? innerBlocks.map(renderBlock).join('')
    : (innerHTML ?? innerContent.join('') ?? '');

  // Generate block comment wrapper
  const attrString = Object.keys(attributes).length > 0
    ? ` ${JSON.stringify(attributes)}`
    : '';

  return `<!-- wp:${name}${attrString} -->${renderedInner}<!-- /wp:${name} -->`;
}

/**
 * Transform known shortcodes to block equivalents
 */
export function transformShortcodesToBlocks(content: StructuredContent, mediaMap: Map<number, string>): StructuredContent {
  if (content.classic) {
    // Process classic content for shortcodes
    let html = content.classic.html;

    // [gallery] → core/gallery block
    html = html.replace(/\[gallery\s+ids="([^"]+)"\]/g, (match: string, ids: string) => {
      const idArray = ids.split(',').map(id => parseInt(id.trim(), 10));
      const images = idArray
        .map(id => mediaMap.get(id))
        .filter((url): url is string => !!url);

      return `<!-- wp:gallery {"images":[${images.map((url: string, i: number) => JSON.stringify({ id: idArray[i], url })).join(',')}]} --><!-- /wp:gallery -->`;
    });

    // [video] → core/video block
    html = html.replace(/\[video\s+src="([^"]+)"\]/g, (match, src) => {
      return `<!-- wp:video {"src":"${src}"} --><!-- /wp:video -->`;
    });

    // [audio] → core/audio block
    html = html.replace(/\[audio\s+src="([^"]+)"\]/g, (match, src) => {
      return `<!-- wp:audio {"src":"${src}"} --><!-- /wp:audio -->`;
    });

    // Re-parse the transformed HTML
    return htmlToStructuredContent(html);
  }

  // For block content, shortcodes should already be in core/shortcode blocks
  return content;
}

/**
 * Extract image references from HTML for media mapping
 */
export function extractImageReferences(html: string): { src: string; alt?: string; id?: number }[] {
  const images: { src: string; alt?: string; id?: number }[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1] ?? '';
    const altMatch = match[0].match(/alt=["']([^"']*)["']/);
    const idMatch = match[0].match(/wp-image-(\d+)/);

    images.push({
      src,
      alt: altMatch?.[1],
      id: idMatch ? parseInt(idMatch[1] ?? '0', 10) : undefined,
    });
  }

  return images;
}

/**
 * Extract all URLs from content (for link checking, redirects, etc.)
 */
export function extractUrls(html: string): string[] {
  const urls: string[] = [];
  const urlRegex = /https?:\/\/[^\s<>"'{}|\\^`\[\]]+/g;
  let match;

  while ((match = urlRegex.exec(html)) !== null) {
    urls.push(match[0]);
  }

  return [...new Set(urls)]; // deduplicate
}