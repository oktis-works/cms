import { describe, it, expect } from 'vitest';
import {
  THEME_HYDRATION_ELEMENT_ID,
  readThemeHydrationPayload,
  type ThemeHydrationPayload,
} from './hydrate.js';

const payload: ThemeHydrationPayload = {
  buildId: 'sha256:test',
  templateKey: 'home',
  data: {
    site: { title: 'Site', description: '', theme: 'theme' },
    page: {
      title: 'Home',
      description: '',
      template: 'home.astro',
      type: 'page',
      slug: 'home',
      url: '/',
      hubBase: '',
      itemPath: '',
      canonicalPath: '/',
      isPageForPosts: false,
      isFrontPage: true,
    },
    content: {},
    fields: {},
    record: {},
    items: [],
    pagination: { page: 1, perPage: 0, total: 0, pages: 0, hasPrevious: false, hasNext: false },
    menus: { all: [], bySlug: {} },
    contentTypes: [],
    taxonomies: [],
    terms: {},
    settings: {},
    themeData: { menus: { all: [], bySlug: {} }, contentTypes: [], taxonomies: [], terms: {}, settings: {} },
  },
};

const docWith = (textContent: string | null) => ({
  getElementById: (id: string) => (id === THEME_HYDRATION_ELEMENT_ID ? { textContent } : null),
});

describe('readThemeHydrationPayload', () => {
  it('reads a valid payload from the JSON script', () => {
    expect(readThemeHydrationPayload(docWith(JSON.stringify(payload)))).toEqual(payload);
  });

  it('rejects invalid JSON, missing data and missing ids', () => {
    expect(readThemeHydrationPayload(docWith('{nope'))).toBeNull();
    expect(readThemeHydrationPayload(docWith(JSON.stringify({ buildId: 'x' })))).toBeNull();
    expect(readThemeHydrationPayload(docWith(null))).toBeNull();
    expect(readThemeHydrationPayload({ getElementById: () => null })).toBeNull();
  });
});
