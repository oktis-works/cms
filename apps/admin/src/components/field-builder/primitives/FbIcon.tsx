import { createMemo } from 'solid-js';
import { icons } from 'lucide';

/** Converts a kebab-case lucide name ("chevron-up") to its icons-map key ("ChevronUp"). */
const toPascal = (name: string): string =>
  name.replace(/(^|[-_])(\w)/g, (_match, _sep, char: string) => char.toUpperCase());

/** Default SVG attributes — the same set `createIcons()` applies when it replaces a node. */
const SVG_DEFAULTS =
  'xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const attrsMarkup = (attrs: object): string =>
  Object.entries(attrs)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
    .join(' ');

export interface FbIconProps {
  /** lucide icon name in kebab-case, e.g. "grip-vertical". */
  name: string;
  class?: string;
}

/**
 * Reactive lucide icon: renders `<span class><svg/></span>` and swaps the
 * inner svg whenever `name` changes. Unlike `createIcons()` (which replaces
 * the host node and leaves Solid holding a detached reference), the wrapper
 * stays Solid-managed, so dynamic names never produce stale or orphaned
 * nodes. The wrapper carries the sizing/layout class; the inner svg is
 * sized by the existing `.fb-* svg` rules.
 */
export function FbIcon(props: FbIconProps) {
  const markup = createMemo((): string => {
    const node = icons[toPascal(props.name) as keyof typeof icons];
    if (!node) return '';
    const children = node.map(([tag, attrs]) => `<${tag} ${attrsMarkup(attrs)} />`).join('');
    return `<svg ${SVG_DEFAULTS}>${children}</svg>`;
  });

  return <span class={props.class} aria-hidden="true" innerHTML={markup()} />;
}
