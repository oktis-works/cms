// @oktis-works/core - Local Filesystem Storage Driver

import { mkdir, readFile, writeFile, unlink, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { StorageDriver } from '../driver.js';

export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;
  private readonly root: string;

  constructor(root?: string) {
    this.root = root ?? process.env['STORAGE_LOCAL_PATH'] ?? '.data/storage';
  }

  private resolve(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const base = path.isAbsolute(this.root) ? this.root : path.join(process.cwd(), this.root);
    return path.join(base, normalized);
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<{ key: string; etag?: string }> {
    void _contentType;
    if (!key || key.trim() === '') {
      throw new Error('[local] Storage key é obrigatória');
    }
    const target = this.resolve(key);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);

    return { key, etag: createHash('md5').update(body).digest('hex') };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await unlink(this.resolve(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!key || key.trim() === '') return false;
    try {
      await stat(this.resolve(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const dir = this.resolve(prefix);
    const results: string[] = [];

    const walk = async (current: string, relative: string): Promise<void> => {
      try {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await walk(path.join(current, entry.name), entryRelative);
          } else {
            results.push(entryRelative);
          }
        }
      } catch {
        // directory does not exist
      }
    };

    await walk(dir, prefix.replace(/\/$/, ''));
    return results;
  }

  publicUrl(key: string): string {
    const basePath = (process.env['STORAGE_PUBLIC_BASE'] ?? '/storage').replace(/\/$/, '');
    return `${basePath}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}
