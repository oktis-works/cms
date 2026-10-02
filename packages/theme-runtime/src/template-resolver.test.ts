// @oktis-works/theme-runtime - Template Hierarchy Tests

import { describe, it, expect } from 'vitest';
import { buildTemplateChain, TemplateHierarchyResolver } from './template-resolver.js';

describe('buildTemplateChain', () => {
  it('conteúdo único: {type}-{slug} → {type} → single → index → 404', () => {
    const chain = buildTemplateChain({ type: 'post', slug: 'hello-world' });

    expect(chain).toEqual(['post-hello-world.astro', 'post.astro', 'single.astro', 'index.astro', '404.astro']);
  });

  it('página: genérico page.astro não é duplicado', () => {
    const chain = buildTemplateChain({ type: 'page', slug: 'sobre' });

    expect(chain).toEqual(['page-sobre.astro', 'page.astro', 'index.astro', '404.astro']);
    expect(chain.filter((entry) => entry === 'page.astro')).toHaveLength(1);
  });

  it('arquivo de content type sem slug', () => {
    const chain = buildTemplateChain({ type: 'produto', isArchive: true });

    expect(chain).toEqual(['archive.astro', '404.astro']);
  });

  it('arquivo de taxonomia com slug', () => {
    const chain = buildTemplateChain({ type: 'categoria', slug: 'news', isArchive: true });

    expect(chain).toEqual(['categoria-news.astro', 'taxonomy-news.astro', 'archive.astro', '404.astro']);
  });

  it('home: home.astro → index.astro → 404', () => {
    const chain = buildTemplateChain({ type: 'page', isHome: true });

    expect(chain).toEqual(['home.astro', 'index.astro', '404.astro']);
  });
});

describe('TemplateHierarchyResolver', () => {
  function makeResolver(files: string[]): { resolver: TemplateHierarchyResolver; checked: string[] } {
    const set = new Set(files);
    const checked: string[] = [];

    const resolver = new TemplateHierarchyResolver({
      exists(file: string): boolean {
        checked.push(file);
        return set.has(file);
      },
    });

    return { resolver, checked };
  }

  it('resolve o primeiro template existente na cadeia', async () => {
    const { resolver, checked } = makeResolver(['post.astro']);

    const result = await resolver.resolve({ type: 'post', slug: 'hello' });

    expect(result.file).toBe('post.astro');
    expect(result.name).toBe('post');
    expect(result.triedChain).toEqual(['post-hello.astro', 'post.astro']);
    expect(checked).toEqual(['post-hello.astro', 'post.astro']);
  });

  it('prefere template específico por slug', async () => {
    const { resolver } = makeResolver(['page-contato.astro', 'page.astro']);

    const result = await resolver.resolve({ type: 'page', slug: 'contato' });

    expect(result.file).toBe('page-contato.astro');
  });

  it('home usa home.astro quando presente', async () => {
    const { resolver } = makeResolver(['home.astro']);

    const result = await resolver.resolve({ type: 'page', isHome: true });

    expect(result.file).toBe('home.astro');
  });

  it('fallback final é 404 com a cadeia inteira tentada', async () => {
    const { resolver } = makeResolver([]);

    const chain = buildTemplateChain({ type: 'post', slug: 'x' });
    const result = await resolver.resolve({ type: 'post', slug: 'x' });

    expect(result.file).toBe('404.astro');
    expect(result.name).toBe('404');
    expect(result.triedChain).toEqual(chain);
  });
});
