// @oktis-works/api - Revisions endpoints na collection router (posts/pages/CPTs)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import postsRouter from './index.js';

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@oktis-works/core', () => ({
  contentService: {
    list: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(async () => ({ id: 'c-1', type: 'post' })),
    update: vi.fn(),
    delete: vi.fn(),
    getRevisions: vi.fn(async () => [
      { id: 'rev-1', version: 2, title: 'v2' },
      { id: 'rev-2', version: 1, title: 'v1' },
    ]),
    restoreRevision: vi.fn(async (_id: string, rev: string) =>
      rev === 'rev-1' ? { id: 'c-1', version: 3, title: 'v2' } : null
    ),
  },
}));

import { contentService } from '@oktis-works/core';

beforeEach(() => vi.clearAllMocks());

describe('GET /posts/:id/revisions', () => {
  it('lista revisões com count', async () => {
    const res = await postsRouter.request('/c-1/revisions');
    const body = (await res.json()) as { count: number; data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.count).toBe(2);
    expect(contentService.getRevisions).toHaveBeenCalledWith('c-1');
  });

  it('404 para conteúdo de outro tipo', async () => {
    vi.mocked(contentService.getById).mockResolvedValueOnce({ id: 'c-2', type: 'page' } as never);

    const res = await postsRouter.request('/c-2/revisions');

    expect(res.status).toBe(404);
    expect(contentService.getRevisions).not.toHaveBeenCalled();
  });
});

describe('POST /posts/:id/revisions/:revisionId/restore', () => {
  it('restaura e retorna o conteúdo atualizado', async () => {
    const res = await postsRouter.request('/c-1/revisions/rev-1/restore', { method: 'POST' });
    const body = (await res.json()) as { version: number };

    expect(res.status).toBe(200);
    expect(body.version).toBe(3);
    expect(contentService.restoreRevision).toHaveBeenCalledWith('c-1', 'rev-1');
  });

  it('404 quando a revisão não existe', async () => {
    const res = await postsRouter.request('/c-1/revisions/nope/restore', { method: 'POST' });

    expect(res.status).toBe(404);
  });

  it('400 em erro do serviço', async () => {
    vi.mocked(contentService.restoreRevision).mockRejectedValueOnce(new Error('db down'));

    const res = await postsRouter.request('/c-1/revisions/rev-1/restore', { method: 'POST' });

    expect(res.status).toBe(400);
  });
});
