// @oktis-works/core - Local Storage Driver Tests

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageDriver } from './local.js';

describe('LocalStorageDriver', () => {
  async function makeDriver(): Promise<{ driver: LocalStorageDriver; cleanup: () => Promise<void> }> {
    const root = await mkdtemp(join(tmpdir(), 'okcms-storage-'));
    const driver = new LocalStorageDriver(root);
    return { driver, cleanup: () => rm(root, { recursive: true, force: true }) };
  }

  it('put/get roundtrip', async () => {
    const { driver, cleanup } = await makeDriver();

    const result = await driver.put('2026/08/arquivo.txt', Buffer.from('conteúdo'), 'text/plain');
    expect(result.key).toBe('2026/08/arquivo.txt');
    expect(result.etag).toBeDefined();

    const body = await driver.get('2026/08/arquivo.txt');
    expect(body?.toString('utf-8')).toBe('conteúdo');

    await cleanup();
  });

  it('get retorna null para chave inexistente', async () => {
    const { driver, cleanup } = await makeDriver();

    expect(await driver.get('nao/existe.txt')).toBeNull();

    await cleanup();
  });

  it('exists e delete', async () => {
    const { driver, cleanup } = await makeDriver();

    await driver.put('a/b.png', Buffer.from('x'), 'image/png');

    expect(await driver.exists('a/b.png')).toBe(true);
    expect(await driver.delete('a/b.png')).toBe(true);
    expect(await driver.exists('a/b.png')).toBe(false);

    await cleanup();
  });

  it('list retorna chaves com prefixo', async () => {
    const { driver, cleanup } = await makeDriver();

    await driver.put('media/1.png', Buffer.from('1'), 'image/png');
    await driver.put('media/2.png', Buffer.from('2'), 'image/png');
    await driver.put('docs/a.pdf', Buffer.from('3'), 'application/pdf');

    const keys = await driver.list('media');
    expect(keys.sort()).toEqual(['media/1.png', 'media/2.png']);

    await cleanup();
  });

  it('publicUrl usa base configurada', async () => {
    const { driver, cleanup } = await makeDriver();
    const previous = process.env['STORAGE_PUBLIC_BASE'];
    process.env['STORAGE_PUBLIC_BASE'] = '/storage';

    expect(driver.publicUrl('img/x.png')).toBe('/storage/img/x.png');

    if (previous === undefined) {
      delete process.env['STORAGE_PUBLIC_BASE'];
    } else {
      process.env['STORAGE_PUBLIC_BASE'] = previous;
    }

    await cleanup();
  });
});
