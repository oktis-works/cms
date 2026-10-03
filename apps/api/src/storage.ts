// @oktis-works/api - Storage local de uploads (zero-config)
//
// `UPLOAD_DIR` (default: "uploads" relativo ao cwd do processo) — no scaffold
// fica dentro do projeto, então sobrevive a restarts sem volume extra.
// Layout: <uploadDir>/<tenant>/<uuid>.<ext> — o nome aleatório + saneamento
// dos segmentos impede path traversal; o site público busca o arquivo em
// GET /api/v1/media/file/:tenant/:filename (sem token).

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, resolve } from 'node:path';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

const SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FILENAME_RE = /^[A-Za-z0-9_-]{1,64}\.[a-z0-9]{1,10}$/;

const EXT_MIME: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css',
  gif: 'image/gif',
  html: 'text/html',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  ttf: 'font/ttf',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xml: 'application/xml',
  zip: 'application/zip',
};

/** Raiz dos uploads — lê o env a cada chamada (testes trocam UPLOAD_DIR). */
export function getUploadDir(): string {
  const dir = process.env['UPLOAD_DIR'] ?? 'uploads';
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/** Extensão saneada (minúsculas, alfanumérica) — fallback "bin". */
export function safeExtension(filename: string): string {
  const ext = extname(filename).replace(/^\./, '').toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
}

export function mimeFor(filename: string): string {
  const ext = safeExtension(filename);
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

export function isSafeSegment(value: string): boolean {
  return SEGMENT_RE.test(value);
}

export function isSafeStoredPath(relPath: string): boolean {
  const [tenant, filename, ...rest] = relPath.split('/');
  return rest.length === 0 && !!tenant && !!filename && SEGMENT_RE.test(tenant) && FILENAME_RE.test(filename);
}

/** Grava o arquivo em <uploadDir>/<tenant>/<uuid>.<ext>. */
export async function saveUpload(
  tenantId: string,
  originalFilename: string,
  data: Uint8Array
): Promise<{ path: string; size: number }> {
  if (!SEGMENT_RE.test(tenantId)) {
    throw new Error('Invalid tenant for upload');
  }

  const filename = `${randomUUID()}.${safeExtension(originalFilename)}`;
  const dir = join(getUploadDir(), tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), data);

  return { path: `${tenantId}/${filename}`, size: data.byteLength };
}

export async function readUpload(relPath: string): Promise<Buffer | null> {
  if (!isSafeStoredPath(relPath)) return null;
  try {
    return await readFile(join(getUploadDir(), relPath));
  } catch {
    return null;
  }
}

/** Remove o arquivo (best-effort — só é chamado após o row já existir). */
export async function removeUpload(relPath: string): Promise<void> {
  if (!isSafeStoredPath(relPath)) return;
  try {
    await unlink(join(getUploadDir(), relPath));
  } catch {
    // arquivo já inexistente — segue
  }
}
