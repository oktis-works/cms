// @oktis-works/theme-runtime - Runtime Routing Tests

import { describe, it, expect, vi } from 'vitest';
import { RuntimeRouter, targetedRevalidate, type ContentLookup } from './routing.js';
import { TemplateHierarchyResolver } from './template-resolver.js';

function makeRouter(lookup: ContentLookup, files: string[]): RuntimeRouter {
  const set = new Set(files);
  const resolver = new TemplateHierarchyResolver({
    exists: (file) => set.has(file),
  });
  return new RuntimeRouter(lookup, resolver);
}

describe('RuntimeRouter', () => {
  it('resolve home para index.astro (fallback quando sem static_front_page)', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn(),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting: vi.fn().mockResolvedValue(null),
    };
    const router = makeRouter(lookup, ['index.astro']);

    const result = await router.resolve('/');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('index.astro');
    expect(lookup.getSetting).toHaveBeenCalledWith('static_front_page');
    expect(lookup.findByPath).not.toHaveBeenCalled();
  });

  it('resolve static_front_page quando configurado', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn(),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue({ type: 'page', slug: 'home', data: {}, record: {} }),
      getSetting: vi.fn().mockImplementation((key) => key === 'static_front_page' ? Promise.resolve('page-id-123') : Promise.resolve(null)),
    };
    const router = makeRouter(lookup, ['page-home.astro', 'index.astro']);

    const result = await router.resolve('/');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('page-home.astro');
    expect(result.contentType).toBe('page');
    expect(result.slug).toBe('home');
  });

  it('resolve page_for_posts quando configurado', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn(),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue({ type: 'page', slug: 'blog', data: {}, record: {} }),
      getSetting: vi.fn().mockImplementation((key) => {
        if (key === 'static_front_page') return Promise.resolve(null);
        if (key === 'page_for_posts') return Promise.resolve('page-id-456');
        return Promise.resolve(null);
      }),
    };
    const router = makeRouter(lookup, ['page-blog.astro', 'index.astro']);

    const result = await router.resolve('/');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('page-blog.astro');
    expect(result.contentType).toBe('page');
    expect(result.slug).toBe('blog');
    expect((result as any).isPageForPosts).toBe(true);
  });

  it('fallback de / para a página de posts prefere posts.astro (home.php)', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn(),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue({ type: 'page', slug: 'blog', data: {}, record: {} }),
      getSetting: vi.fn().mockImplementation((key) =>
        key === 'page_for_posts' ? Promise.resolve('page-id-456') : Promise.resolve(null)
      ),
    };
    const router = makeRouter(lookup, ['posts.astro', 'page-blog.astro']);

    const result = await router.resolve('/');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('posts.astro');
    expect((result as any).isPageForPosts).toBe(true);
  });

  it('resolve /blog (página de posts acessada direto) como listagem — posts.astro + isPageForPosts', async () => {
    const blogRecord = { id: 'page-id-456', title: 'Blog' };
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'page', slug: 'blog', data: {}, record: blogRecord }),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting: vi.fn().mockImplementation((key) =>
        key === 'page_for_posts' ? Promise.resolve('page-id-456') : Promise.resolve(null)
      ),
    };
    const router = makeRouter(lookup, ['posts.astro', 'page.astro']);

    const result = await router.resolve('/blog');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('posts.astro');
    expect(result.contentType).toBe('page');
    expect(result.slug).toBe('blog');
    // o web usa este flag para buscar os itens publicados (tipo post)
    expect((result as any).isPageForPosts).toBe(true);
  });

  it('sem posts.astro no tema, /blog ainda sinaliza a listagem e cai na cadeia de page', async () => {
    const blogRecord = { id: 'page-id-456', title: 'Blog' };
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'page', slug: 'blog', data: {}, record: blogRecord }),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting: vi.fn().mockImplementation((key) =>
        key === 'page_for_posts' ? Promise.resolve('page-id-456') : Promise.resolve(null)
      ),
    };
    const router = makeRouter(lookup, ['page-blog.astro']);

    const result = await router.resolve('/blog');

    expect(result.template).toBe('page-blog.astro');
    expect((result as any).isPageForPosts).toBe(true);
  });

  it('/blog usa a chave canônica postsPage com precedência sobre a legada page_for_posts', async () => {
    const blogRecord = { id: 'canonical-id', title: 'Blog' };
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'page', slug: 'blog', data: {}, record: blogRecord }),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting: vi.fn().mockImplementation((key) => {
        if (key === 'postsPage') return Promise.resolve('canonical-id');
        if (key === 'page_for_posts') return Promise.resolve('legacy-id');
        return Promise.resolve(null);
      }),
    };
    const router = makeRouter(lookup, ['posts.astro']);

    const result = await router.resolve('/blog');
    expect((result as any).isPageForPosts).toBe(true);

    // legada aponta para OUTRA página → a canônica vence, sem flag
    blogRecord['id'] = 'legacy-id';
    const second = await router.resolve('/blog');
    expect(second.template).not.toBe('posts.astro');
    expect((second as any).isPageForPosts).toBeUndefined();
  });

  it('página comum (não é a de posts) continua estática — sem listagem', async () => {
    const aboutRecord = { id: 'about-id', title: 'About' };
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'page', slug: 'about', data: {}, record: aboutRecord }),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting: vi.fn().mockImplementation((key) =>
        key === 'page_for_posts' ? Promise.resolve('page-id-456') : Promise.resolve(null)
      ),
    };
    const router = makeRouter(lookup, ['posts.astro', 'page.astro']);

    const result = await router.resolve('/about');

    expect(result.template).toBe('page.astro');
    expect((result as any).isPageForPosts).toBeUndefined();
  });

  it('conteúdo que não é page nunca vira página de posts (sem query extra de setting)', async () => {
    const postRecord = { id: 'page-id-456', title: 'Hello' };
    const getSetting = vi.fn().mockResolvedValue(null);
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'post', slug: 'hello', data: {}, record: postRecord }),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting,
    };
    const router = makeRouter(lookup, ['single.astro']);

    const result = await router.resolve('/hello');

    expect(result.template).toBe('single.astro');
    expect((result as any).isPageForPosts).toBeUndefined();
    expect(getSetting).not.toHaveBeenCalledWith('postsPage');
    expect(getSetting).not.toHaveBeenCalledWith('page_for_posts');
  });

  it('/page/blog (aninhada) também resolve a listagem quando o slug é a página de posts', async () => {
    const blogRecord = { id: 'page-id-456', title: 'Blog' };
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'page', slug: 'blog', data: {}, record: blogRecord }),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting: vi.fn().mockImplementation((key) =>
        key === 'page_for_posts' ? Promise.resolve('page-id-456') : Promise.resolve(null)
      ),
    };
    const router = makeRouter(lookup, ['posts.astro']);

    const result = await router.resolve('/page/blog');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('posts.astro');
    expect((result as any).isPageForPosts).toBe(true);
  });

  it('resolve home para archive de posts quando sem configuração', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn(),
      listTypes: vi.fn().mockResolvedValue([{ slug: 'post', hasArchive: true }]),
      findById: vi.fn(),
      getSetting: vi.fn().mockResolvedValue(null),
    };
    const router = makeRouter(lookup, ['archive.astro', 'index.astro']);

    const result = await router.resolve('/');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('archive.astro');
    expect(result.contentType).toBe('post');
  });

  it('resolve conteúdo por slug com template específico', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'post', slug: 'hello', data: {} }),
      listTypes: vi.fn(),
      findById: vi.fn(),
      getSetting: vi.fn(),
    };
    const router = makeRouter(lookup, ['post-hello.astro']);

    const result = await router.resolve('/post/hello');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('post-hello.astro');
    expect(result.contentType).toBe('post');
    expect(result.slug).toBe('hello');
  });

  it('propaga data (enriquecido) e record até a resolução (sem re-consulta no web)', async () => {
    const enriched = { title: 'Olá', cover: { id: '1', url: '/media/a.png', alt: null }, _terms: { tag: [{ slug: 'cms', name: 'CMS' }] } };
    const record = { id: 'content-1', title: 'Olá', body: { title: 'Olá' } };
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'post', slug: 'hello', data: enriched, record }),
      listTypes: vi.fn(),
      findById: vi.fn(),
      getSetting: vi.fn(),
    };
    const router = makeRouter(lookup, ['post.astro']);

    const result = await router.resolve('/hello');

    expect(result.matched).toBe(true);
    expect(result.data).toBe(enriched);
    expect(result.record).toBe(record);
  });

  it('não casa URL aninhada quando o primeiro segmento não é o tipo do conteúdo', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'post', slug: 'hello', data: {} }),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting: vi.fn(),
    };
    const router = makeRouter(lookup, ['post-hello.astro']);

    const result = await router.resolve('/qualquer-caminho/hello');

    expect(result.matched).toBe(false);
  });

  it('resolve arquivo de content type quando não há conteúdo com o slug', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue(null),
      listTypes: vi
        .fn()
        .mockResolvedValue([
          { slug: 'produto', hasArchive: true },
          { slug: 'page', hasArchive: false },
        ]),
      findById: vi.fn(),
      getSetting: vi.fn(),
    };
    const router = makeRouter(lookup, ['archive.astro']);

    const result = await router.resolve('/produto');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('archive.astro');
    expect(result.contentType).toBe('produto');
  });

  it('não trata content types sem archive como rota de arquivo', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue(null),
      listTypes: vi.fn().mockResolvedValue([{ slug: 'page', hasArchive: false }]),
      findById: vi.fn(),
      getSetting: vi.fn(),
    };
    const router = makeRouter(lookup, []);

    const result = await router.resolve('/page');

    expect(result.matched).toBe(false);
  });

  it('caminho desconhecido não corresponde', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue(null),
      listTypes: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getSetting: vi.fn(),
    };
    const router = makeRouter(lookup, []);

    const result = await router.resolve('/nao/existe');

    expect(result.matched).toBe(false);
  });
});

describe('targetedRevalidate', () => {
  it('emite evento theme.route.revalidate com paths e tags', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const bus = { emit };

    await targetedRevalidate(bus, {
      paths: ['/hello', '/produto'],
      tags: ['content:123'],
      tenantId: 'tenant-1',
    });

    expect(emit).toHaveBeenCalledTimes(1);
    const event = emit.mock.calls[0]![0] as Record<string, unknown>;

    expect(event['type']).toBe('theme.route.revalidate');
    expect(event['aggregateId']).toBe('tenant-1');
    expect(event['payload']).toEqual({
      paths: ['/hello', '/produto'],
      tags: ['content:123'],
    });
  });
});
