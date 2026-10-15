// @oktis-works/web - Enriquecimento de mídia e termos no lookup (REQU-028-001/003)

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
let queue: Row[][];

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (_text: string, _values?: unknown[]) => (queue.shift() ?? [])),
  })),
}));
vi.mock('@oktis-works/plugin-runtime', () => ({
  getHookRegistry: vi.fn(() => ({ addFilter: vi.fn(), doAction: vi.fn() })),
}));
vi.mock('@oktis-works/core', () => ({
  postTypeRegistry: { list: vi.fn(async () => []) },
  HOOK_POINTS: {},
}));

import { createContentLookup } from './rendering.js';

beforeEach(() => {
  queue = [];
});

describe('createContentLookup.findByPath — enriquecimento', () => {
  it('substitui UUIDs de mídia por objetos reais e injeta _terms', async () => {
    const mediaId = '0b9e6c35-7d5a-4f1e-9a3b-2c4d5e6f7081';
    const termId = '11111111-2222-4333-8444-555555555555';

    // Query 1: content; Query 2: media batched; Query 3: terms
    queue = [
      [
        {
          id: 'c1',
          type: 'post',
          slug: 'ola',
          layout: null,
          body: {
            title: 'Olá',
            thumbnail: mediaId,
            gallery: [mediaId],
            meta: { author_id: termId },
          },
        },
      ],
      [{ id: mediaId, url: 'https://cdn.local/img.png', alt: 'Capa' }],
      [
        { taxonomy_slug: 'category', term_slug: 'noticias', term_name: 'Notícias' },
        { taxonomy_slug: 'category', term_slug: 'tech', term_name: 'Tech' },
        { taxonomy_slug: 'post_tag', term_slug: 'cms', term_name: 'CMS' },
      ],
    ];

    const found = await createContentLookup().findByPath('ola');
    expect(found).not.toBeNull();
    const data = found!.data;

    expect(data['thumbnail']).toEqual({ id: mediaId, url: 'https://cdn.local/img.png', alt: 'Capa', filename: null });
    expect(Array.isArray(data['gallery'])).toBe(true);

    expect((data['_terms'] as Record<string, unknown>)['category']).toEqual([
      { slug: 'noticias', name: 'Notícias' },
      { slug: 'tech', name: 'Tech' },
    ]);
    expect((data['_terms'] as Record<string, unknown>)['post_tag']).toEqual([{ slug: 'cms', name: 'CMS' }]);

    // record: a row bruta vai junto no retorno (o web usa sem re-consultar)
    expect(found!.record!['id']).toBe('c1');
    expect(found!.record!['slug']).toBe('ola');
  });

  it('UUID fora de campo de mídia permanece intacto e _terms ausente quando vazio', async () => {
    const randomUuid = '99999999-8888-4777-8666-555555555555';
    queue = [
      [{ id: 'c2', type: 'page', slug: 'sobre', body: { ref: randomUuid } }],
      [],
      [],
    ];

    const found = await createContentLookup().findByPath('sobre');

    expect(found!.data['ref']).toBe(randomUuid);
    expect(found!.data['_terms']).toBeUndefined();
  });

  it('falha no enriquecimento não derruba o render', async () => {
    let calls = 0;
    const sql = {
      unsafe: vi.fn(async () => {
        calls += 1;
        if (calls > 1) throw new Error('boom');
        return [{ id: 'c3', type: 'post', slug: 'x', body: { thumbnail: '99999999-8888-4777-8666-555555555555' } }];
      }),
    };
    const { getConnection } = await import('@oktis-works/database');
    (getConnection as ReturnType<typeof vi.fn>).mockReturnValueOnce(sql as never);

    const found = await createContentLookup().findByPath('x');
    expect(found).not.toBeNull();
  });
});

describe('enrichItemsMedia — REQU-028-001 em listas (archive/home)', () => {
  it('enriquece N itens com UMA query de mídia (sem N+1)', async () => {
    const capa1 = '0b9e6c35-7d5a-4f1e-9a3b-2c4d5e6f7081';
    const capa2 = '1b9e6c35-7d5a-4f1e-9a3b-2c4d5e6f7082';
    const { enrichItemsMedia } = await import('./rendering.js');

    const unsafe = vi.fn(async (_text: string, _values?: unknown[]) => [
      { id: capa1, url: '/media/a.png', alt: 'A', filename: 'a.png' },
      { id: capa2, url: '/media/b.png', alt: null, filename: 'b.png' },
    ]);

    const items = [
      { title: 'Um', slug: 'um', cover: capa1 },
      { title: 'Dois', slug: 'dois', cover: capa2 },
    ];
    await enrichItemsMedia({ unsafe } as never, items);

    // Uma única chamada para os dois itens
    expect(unsafe).toHaveBeenCalledTimes(1);
    expect(unsafe.mock.calls[0]![1]).toEqual([[capa1, capa2]]);

    expect(items[0]!['cover']).toEqual({ id: capa1, url: '/media/a.png', alt: 'A', filename: 'a.png' });
    expect(items[1]!['cover']).toEqual({ id: capa2, url: '/media/b.png', alt: null, filename: 'b.png' });
  });

  it('sem UUIDs de mídia não consulta o banco', async () => {
    const { enrichItemsMedia } = await import('./rendering.js');
    const unsafe = vi.fn(async (_text: string, _values?: unknown[]) => [] as unknown[]);

    await enrichItemsMedia({ unsafe } as never, [{ title: 'sem mídia' }]);

    expect(unsafe).not.toHaveBeenCalled();
  });
});

describe('buildThemeSettings — customizador exposto como settings.theme', () => {
  it('defaults do manifesto sobrescritos pelo config salvo', async () => {
    const { buildThemeSettings } = await import('./rendering.js');

    const manifest = {
      settings: [
        { name: 'siteTitle', type: 'text', label: 'Título', default: 'OkCMS' },
        { name: 'accent', type: 'color', default: '#000000' },
        { name: 'semDefault', type: 'text' },
      ],
    };

    const merged = buildThemeSettings(manifest, { siteTitle: 'Meu Site' });
    expect(merged).toEqual({
      siteTitle: 'Meu Site', // config vence sobre o default
      accent: '#000000', // default do manifesto
      semDefault: undefined, // declarado sem default
    });
  });

  it('sem manifesto/config devolve objeto vazio (nunca undefined)', async () => {
    const { buildThemeSettings } = await import('./rendering.js');
    expect(buildThemeSettings(null, null)).toEqual({});
    expect(buildThemeSettings(undefined, undefined)).toEqual({});
    expect(buildThemeSettings({ settings: 'nao-array' }, {})).toEqual({});
  });
});
