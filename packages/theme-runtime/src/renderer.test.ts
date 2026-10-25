import { describe, it, expect, beforeEach } from 'vitest';

describe('ThemeRenderer', () => {
  let ThemeRenderer: any;

  beforeEach(async () => {
    const mod = await import('./renderer.js');
    ThemeRenderer = mod.ThemeRenderer;
  });

  it('should create a renderer instance', () => {
    const renderer = new ThemeRenderer({ themePath: '/mock/path' });
    expect(renderer).toBeDefined();
  });

  it('should have render method', () => {
    const renderer = new ThemeRenderer({ themePath: '/mock/path' });
    expect(typeof renderer.render).toBe('function');
  });

  it('renders helpers, else-if branches, and sanitizes raw HTML', async () => {
    const renderer = new ThemeRenderer();
    const template = '{{#if (eq type \'heading\')}}<h{{level}}>{{content}}</h{{level}}>{{else if content}}<p>{{{content}}}</p>{{else}}empty{{/if}}';
    expect(renderer.renderString(template, { type: 'heading', level: 2, content: 'Title' })).toBe('<h2>Title</h2>');
    expect(renderer.renderString(template, { content: '<strong>safe</strong><script>alert(1)</script>' })).toBe('<p><strong>safe</strong></p>');
    expect(renderer.renderString(template, {})).toBe('empty');
  });

  it('resolves canonical field helpers without exposing arbitrary function execution', () => {
    const renderer = new ThemeRenderer();
    const template = '<h1>{{field "title"}}</h1>{{#if (field "showHero")}}hero{{/if}}';
    expect(renderer.renderString(template, {}, { title: 'Canonical', body: { showHero: true } })).toBe('<h1>Canonical</h1>hero');
    expect(renderer.renderString('{{field "body.secret"}}', {}, { body: { secret: 'hidden' } })).toBe('');
  });
});

describe('ThemeRenderer — cache de templates', () => {
  it('eviction FIFO mantém o render correto mesmo com muitos templates únicos', async () => {
    const { ThemeRenderer } = await import('./renderer.js');
    const renderer = new ThemeRenderer();

    // acima do teto (200): o cache precisa evicionar sem perder corretude
    for (let i = 0; i < 260; i++) {
      const html = renderer.renderString(`<p>t${i} {{valor}}</p>`, { valor: String(i) });
      expect(html).toBe(`<p>t${i} ${i}</p>`);
    }

    // template do início da varredura ainda renderiza certo após as evictions
    expect(renderer.renderString('<p>t0 {{valor}}</p>', { valor: '0' })).toBe('<p>t0 0</p>');
  });
});
