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
  it('resolve home para index.astro', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn(),
      listTypes: vi.fn().mockResolvedValue([]),
    };
    const router = makeRouter(lookup, ['index.astro']);

    const result = await router.resolve('/');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('index.astro');
    expect(lookup.findByPath).not.toHaveBeenCalled();
  });

  it('resolve conteúdo por slug com template específico', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'post', slug: 'hello', data: {} }),
      listTypes: vi.fn(),
    };
    const router = makeRouter(lookup, ['post-hello.astro']);

    const result = await router.resolve('/post/hello');

    expect(result.matched).toBe(true);
    expect(result.template).toBe('post-hello.astro');
    expect(result.contentType).toBe('post');
    expect(result.slug).toBe('hello');
  });

  it('não casa URL aninhada quando o primeiro segmento não é o tipo do conteúdo', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue({ type: 'post', slug: 'hello', data: {} }),
      listTypes: vi.fn().mockResolvedValue([]),
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
    };
    const router = makeRouter(lookup, []);

    const result = await router.resolve('/page');

    expect(result.matched).toBe(false);
  });

  it('caminho desconhecido não corresponde', async () => {
    const lookup: ContentLookup = {
      findByPath: vi.fn().mockResolvedValue(null),
      listTypes: vi.fn().mockResolvedValue([]),
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
