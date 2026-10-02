import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { ThemeComponent, RenderContext, PageProps } from '@oktis-works/theme-sdk';
import { runWithCurrentContent } from '@oktis-works/theme-sdk';

type TemplateNode =
  | { type: 'text'; value: string }
  | { type: 'variable'; name: string; raw: boolean }
  | { type: 'each'; key: string; body: TemplateNode[] }
  | { type: 'if'; condition: string; body: TemplateNode[] };

interface CompiledTemplate {
  nodes: TemplateNode[];
}

interface AssetEntry {
  url: string;
  preload?: boolean;
}

interface RenderedPage {
  html: string;
  styles: AssetEntry[];
  scripts: AssetEntry[];
}

export class ThemeRenderer {
  private layoutCache = new Map<string, string>();
  private componentCache = new Map<string, ThemeComponent>();
  private templateCache = new Map<string, CompiledTemplate>();
  private readonly templatesDir?: string;

  constructor(options: { templatesDir?: string } = {}) {
    this.templatesDir = options.templatesDir;
  }

  async render(page: PageProps, context: RenderContext): Promise<RenderedPage> {
    const layoutTemplate = await this.resolveLayout(page.meta?.['layout'] ?? 'default');
    const compiled = this.compile(layoutTemplate);
    const merged: Record<string, unknown> = { title: page.title, content: page.content };
    if (page.meta) {
      for (const [k, v] of Object.entries(page.meta)) merged[k] = v;
    }
    const body = runWithCurrentContent(context.record ?? {}, () =>
      this.execute(compiled, merged)
    );

    const styles: AssetEntry[] = [];
    const scripts: AssetEntry[] = [];

    if (context.settings['styles']) {
      for (const s of context.settings['styles'] as string[]) {
        styles.push({ url: s });
      }
    }
    if (context.settings['scripts']) {
      for (const s of context.settings['scripts'] as string[]) {
        scripts.push({ url: s });
      }
    }

    return { html: body, styles, scripts };
  }

  async resolveLayout(name: string): Promise<string> {
    if (this.layoutCache.has(name)) {
      return this.layoutCache.get(name)!;
    }
    throw new Error(`Layout not found: ${name}`);
  }

  async resolveComponent(name: string): Promise<ThemeComponent> {
    if (this.componentCache.has(name)) {
      return this.componentCache.get(name)!;
    }
    throw new Error(`Component not found: ${name}`);
  }

  async renderPartial(name: string, props: Record<string, unknown>): Promise<string> {
    const component = await this.resolveComponent(name);
    if (!component.file) {
      throw new Error(`Component file not set: ${name}`);
    }
    const template = await this.loadTemplate(component.file);
    const compiled = this.compile(template);
    return this.execute(compiled, props);
  }

  applyStyles(html: string, styles: AssetEntry[], opts?: { themeName?: string }): string {
    if (styles.length === 0) return html;

    const links = styles
      .map(s => {
        const href = `href="${this.escapeHtml(s.url)}"`;
        const dataTheme = opts?.themeName ? ` data-theme-style="${this.escapeHtml(opts.themeName)}"` : '';
        return s.preload
          ? `<link rel="preload" as="style" ${href} onload="this.rel='stylesheet'"${dataTheme} />`
          : `<link rel="stylesheet" ${href}${dataTheme} />`;
      })
      .join('\n');

    if (html.includes('</head>')) {
      return html.replace('</head>', `${links}\n</head>`);
    }
    return `${links}\n${html}`;
  }

  /**
   * Envelopa body/html com atributo data-theme para isolamento fino.
   * Todo CSS escopado via style-engine usa [data-theme="nome"] como prefixo,
   * garantindo que não vaze para o admin (admin não possui data-theme).
   */
  wrapWithThemeScope(html: string, themeName: string): string {
    const attr = `data-theme="${this.escapeHtml(themeName)}"`;
    // injeta no <main> ou <body> ou cria wrapper
    if (html.includes('data-theme=')) return html;
    if (html.includes('<main')) {
      return html.replace(/<main\b/, `<main ${attr}`);
    }
    if (html.includes('<body')) {
      return html.replace(/<body\b/, `<body ${attr}`);
    }
    return `<div ${attr}>${html}</div>`;
  }

  compile(template: string): CompiledTemplate {
    if (this.templateCache.has(template)) {
      return this.templateCache.get(template)!;
    }
    const nodes = this.parse(template, 0);
    const compiled: CompiledTemplate = { nodes };
    this.templateCache.set(template, compiled);
    return compiled;
  }

  registerLayout(name: string, template: string): void {
    this.layoutCache.set(name, template);
  }

  registerComponent(component: ThemeComponent): void {
    this.componentCache.set(component.name, component);
  }

  private parse(template: string, start: number): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    let i = start;

    while (i < template.length) {
      if (template[i] === '{' && template[i + 1] === '{') {
        const closeIndex = template.indexOf('}}', i + 2);
        if (closeIndex === -1) {
          nodes.push({ type: 'text', value: template.slice(i) });
          break;
        }
        const raw = template[i + 2] === '{' && template[closeIndex - 1] === '}';
        const innerStart = i + (raw ? 3 : 2);
        const expression = template.slice(innerStart, raw ? closeIndex - 1 : closeIndex).trim();

        if (expression.startsWith('#each ')) {
          const key = expression.slice(6).trim();
          const bodyEnd = this.findMatchingEnd(template, closeIndex + 2, '{{#each ', '{{/each}}');
          const body = this.parse(template.slice(closeIndex + 2, bodyEnd), 0);
          nodes.push({ type: 'each', key, body });
          i = bodyEnd + '{{/each}}'.length;
        } else if (expression.startsWith('#if ')) {
          const condition = expression.slice(4).trim();
          const bodyEnd = this.findMatchingEnd(template, closeIndex + 2, '{{#if ', '{{/if}}');
          const body = this.parse(template.slice(closeIndex + 2, bodyEnd), 0);
          nodes.push({ type: 'if', condition, body });
          i = bodyEnd + '{{/if}}'.length;
        } else {
          nodes.push({ type: 'variable', name: expression, raw });
          i = closeIndex + 2;
        }
      } else {
        let nextTag = template.indexOf('{{', i + 1);
        if (nextTag === -1) nextTag = template.length;
        const text = template.slice(i, nextTag);
        if (text) nodes.push({ type: 'text', value: text });
        i = nextTag;
      }
    }

    return nodes;
  }

  private findMatchingEnd(template: string, start: number, openTag: string, endTag: string): number {
    let depth = 1;
    let i = start;
    while (i < template.length) {
      const nextOpen = template.indexOf(openTag, i);
      const nextEnd = template.indexOf(endTag, i);
      if (nextEnd === -1) return template.length;
      if (nextOpen !== -1 && nextOpen < nextEnd) {
        depth++;
        i = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) return nextEnd;
        i = nextEnd + endTag.length;
      }
    }
    return template.length;
  }

  private execute(compiled: CompiledTemplate, context: Record<string, unknown>): string {
    return compiled.nodes.map(node => this.renderNode(node, context)).join('');
  }

  private renderNode(node: TemplateNode, context: Record<string, unknown>): string {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'variable': {
        const value = String(this.resolveVariable(node.name, context) ?? '');
        return node.raw ? value : this.escapeHtml(value);
      }
      case 'each': {
        const collection = this.resolveVariable(node.key, context) as unknown[];
        if (!Array.isArray(collection)) return '';
        return collection.map(item => {
          const subContext = { ...context, ...(item as Record<string, unknown>) };
          return node.body.map(n => this.renderNode(n, subContext)).join('');
        }).join('');
      }
      case 'if': {
        const val = this.resolveVariable(node.condition, context);
        if (val && val !== 'false' && val !== '0') {
          return node.body.map(n => this.renderNode(n, context)).join('');
        }
        return '';
      }
    }
  }

  private resolveVariable(name: string, context: Record<string, unknown>): unknown {
    const parts = name.split('.');
    let current: unknown = context;
    for (const part of parts) {
      if (current === null || current === undefined) return '';
      current = (current as Record<string, unknown>)[part];
    }
    return current ?? '';
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private async loadTemplate(file: string): Promise<string> {
    if (!this.templatesDir) {
      throw new Error(`Template file loading not configured: register "${file}" via registerLayout/registerComponent or provide templatesDir`);
    }
    const base = isAbsolute(this.templatesDir) ? this.templatesDir : resolve(process.cwd(), this.templatesDir);
    const target = resolve(base, file);
    if (!target.startsWith(base)) {
      throw new Error(`Template path escapes templates directory: ${file}`);
    }
    return readFileSync(target, 'utf-8');
  }
}
