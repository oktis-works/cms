import { beforeEach, describe, expect, it } from 'vitest';
import {
  getContent,
  getMenu,
  getSetting,
  getThemeDataProvider,
  runWithThemeDataProvider,
  setThemeDataProvider,
} from './data.js';

function provider(title: string) {
  return {
    getMenu: async () => ({ id: title, name: title, slug: title, items: [] }),
    getMenus: async () => [],
    getContent: async () => ({ data: [{ title }], total: 1, page: 1, limit: 20, pages: 1 }),
    getContentById: async () => null,
    getContentBySlug: async () => null,
    getContentType: async () => null,
    getContentTypes: async () => [],
    getTaxonomy: async () => null,
    getTaxonomies: async () => [],
    getTaxonomyTerms: async () => [],
    getSettings: async () => ({ siteTitle: title }),
  };
}

describe('unified theme data API', () => {
  beforeEach(() => setThemeDataProvider(null));

  it('uses the provider inside the current request context', async () => {
    const current = provider('current');
    await runWithThemeDataProvider(current, async () => {
      expect((await getMenu('main'))?.name).toBe('current');
      expect((await getContent()).data[0]?.['title']).toBe('current');
      expect(await getSetting('siteTitle')).toBe('current');
      expect(getThemeDataProvider()).toBe(current);
    });
    expect(getThemeDataProvider()).toBeNull();
  });

  it('keeps concurrent provider contexts isolated', async () => {
    const first = provider('first');
    const second = provider('second');
    const values = await Promise.all([
      runWithThemeDataProvider(first, async () => { await new Promise((resolve) => setTimeout(resolve, 5)); return (await getContent()).data[0]?.['title']; }),
      runWithThemeDataProvider(second, async () => { await new Promise((resolve) => setTimeout(resolve, 1)); return (await getContent()).data[0]?.['title']; }),
    ]);
    expect(values).toEqual(['first', 'second']);
  });
});
