// @oktis-works/api - rotas /media: upload multipart real + serve público de arquivos

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const authMiddleware = vi.fn(async (_c: unknown, next: () => Promise<void>) => next());

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: async (c: unknown, next: () => Promise<void>) => authMiddleware(c, next),
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@oktis-works/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oktis-works/database')>();
  return { ...actual, resolveTenantId: vi.fn(async () => 'tenant-uuid-0000') };
});

vi.mock('@oktis-works/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oktis-works/core')>();
  return {
    ...actual,
    mediaService: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
});

import mediaRouter from './index.js';
import { mediaService } from '@oktis-works/core';

const svc = () => vi.mocked(mediaService);

let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(join(tmpdir(), 'media-test-'));
  process.env['UPLOAD_DIR'] = uploadDir;
});

afterAll(async () => {
  delete process.env['UPLOAD_DIR'];
  await rm(uploadDir, { recursive: true, force: true });
});

beforeEach(() => vi.clearAllMocks());

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function multipart(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

describe('POST /media/upload (multipart)', () => {
  it('grava o arquivo em disco e cria o row com URL pública', async () => {
    svc().create.mockImplementation(async (input) => ({ id: 'm1', ...input }) as never);

    const res = await mediaRouter.request('/upload', {
      method: 'POST',
      body: multipart({
        file: new File([PNG_BYTES], 'foto.png', { type: 'image/png' }),
        alt: 'Uma foto',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { path: string; url: string; size: number };
    expect(body.path).toMatch(/^tenant-uuid-0000\/[0-9a-f-]{36}\.png$/);
    expect(body.url).toContain(`/api/v1/media/file/${body.path}`);
    expect(body.size).toBe(PNG_BYTES.length);

    const onDisk = await readFile(join(uploadDir, body.path));
    expect(new Uint8Array(onDisk)).toEqual(PNG_BYTES);

    expect(svc().create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-uuid-0000',
        filename: 'foto.png',
        mimeType: 'image/png',
        alt: 'Uma foto',
        path: body.path,
      })
    );
  });

  it('sem campo file → 400', async () => {
    const res = await mediaRouter.request('/upload', {
      method: 'POST',
      body: multipart({ alt: 'só texto' }),
    });
    expect(res.status).toBe(400);
    expect(svc().create).not.toHaveBeenCalled();
  });

  it('arquivo vazio → 400', async () => {
    const res = await mediaRouter.request('/upload', {
      method: 'POST',
      body: multipart({ file: new File([], 'vazio.png', { type: 'image/png' }) }),
    });
    expect(res.status).toBe(400);
  });

  it('POST / com JSON legado continua aceitando (compat)', async () => {
    svc().create.mockResolvedValue({ id: 'm2' } as never);

    const res = await mediaRouter.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'x.png',
        mimeType: 'image/png',
        size: 10,
        path: 'tenant/x.png',
        url: 'http://localhost:3000/api/v1/media/file/tenant/x.png',
      }),
    });

    expect(res.status).toBe(201);
    expect(svc().create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-uuid-0000', path: 'tenant/x.png', uploadedBy: undefined })
    );
  });
});

describe('GET /media/file/:tenant/:filename (público)', () => {
  it('serve o arquivo sem token, com MIME e cache imutável (authMiddleware não roda)', async () => {
    const rel = 'tenant-uuid-0000/abc123.png';
    await mkdir(join(uploadDir, 'tenant-uuid-0000'), { recursive: true });
    await writeFile(join(uploadDir, rel.split('/')[0]!, rel.split('/')[1]!), PNG_BYTES);

    const res = await mediaRouter.request(`/file/tenant-uuid-0000/abc123.png`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
    expect(authMiddleware).not.toHaveBeenCalled();
  });

  it('path traversal (filename com / ou ..) → 404', async () => {
    const res = await mediaRouter.request('/file/tenant-uuid-0000/..%2F..%2Fpackage.json');
    expect(res.status).toBe(404);
  });

  it('arquivo inexistente → 404', async () => {
    const res = await mediaRouter.request('/file/tenant-uuid-0000/nao-existe.png');
    expect(res.status).toBe(404);
  });
});

describe('GET/PUT/DELETE /media/:id', () => {
  it('GET / exige sessão (authMiddleware roda)', async () => {
    svc().list.mockResolvedValue({ data: [], total: 0 });
    const res = await mediaRouter.request('/');
    expect(res.status).toBe(200);
    expect(authMiddleware).toHaveBeenCalled();
  });

  it('PUT /:id atualiza alt/caption', async () => {
    svc().update.mockResolvedValue({ id: 'm1' } as never);

    const res = await mediaRouter.request('/m1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt: 'Novo alt', caption: 'Legenda' }),
    });

    expect(res.status).toBe(200);
    expect(svc().update).toHaveBeenCalledWith('m1', {
      alt: 'Novo alt',
      caption: 'Legenda',
      metadata: undefined,
    });
  });

  it('PUT inexistente → 404', async () => {
    svc().update.mockResolvedValue(null);
    const res = await mediaRouter.request('/nope', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE remove o row E o arquivo do disco', async () => {
    const tenantDir = 'tenant-uuid-0000';
    const filename = 'deadbeef-0000-0000-0000-000000000000.png';
    await mkdir(join(uploadDir, tenantDir), { recursive: true });
    await writeFile(join(uploadDir, tenantDir, filename), PNG_BYTES);

    svc().getById.mockResolvedValue({ id: 'm9', path: `${tenantDir}/${filename}` } as never);
    svc().delete.mockResolvedValue(true);

    const res = await mediaRouter.request('/m9', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(svc().delete).toHaveBeenCalledWith('m9');
    await expect(readFile(join(uploadDir, tenantDir, filename))).rejects.toThrow();
  });
});
