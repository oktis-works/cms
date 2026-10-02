// @oktis-works/cms - BUSI-021: busca de extensões no npm por keyword convention

import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchExtensions } from './npm-registry.js';

const npmPayload = {
  objects: [
    {
      package: {
        name: '@acme/okcms-plugin-seo',
        version: '1.2.0',
        description: 'SEO plugin',
        links: { npm: 'https://www.npmjs.com/package/@acme/okcms-plugin-seo' },
      },
    },
    { package: { name: '@acme/okcms-theme-loja', version: '0.3.0' } },
  ],
};

describe('searchExtensions — BUSI-021', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('plugin usa keyword okcms-plugin e mapeia resultado', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => npmPayload }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchExtensions('plugin', 'seo');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('text=seo%20keywords%3Aokcms-plugin');
    expect(url).toContain('size=15');
    expect(results[0]).toEqual({
      name: '@acme/okcms-plugin-seo',
      version: '1.2.0',
      description: 'SEO plugin',
      links: { npm: 'https://www.npmjs.com/package/@acme/okcms-plugin-seo' },
    });
    expect(results[1]?.description).toBe('');
  });

  it('theme usa keyword okcms-theme; sem query usa apenas keyword', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ objects: [] }) }));
    vi.stubGlobal('fetch', fetchMock);

    await searchExtensions('theme');

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keywords%3Aokcms-theme');
  });
});
