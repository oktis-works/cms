import { describe, expect, it } from 'vitest';
import { RuntimeRouter, type ContentLookup } from './routing.js';
import { ThemeTemplateResolver } from './template-resolver.js';

function makeRouter(lookup: ContentLookup, keys: string[]): RuntimeRouter {
  const resolver = new ThemeTemplateResolver({ has: (key) => keys.includes(key) });
  return new RuntimeRouter(lookup, resolver);
}

const baseLookup: ContentLookup = {
  async findByPath() { return null; },
  async findById() { return null; },
  async getSetting() { return null; },
  async listTypes() { return []; },
};

describe('RuntimeRouter logical theme keys', () => {
  it('resolves the root to the home key', async () => {
    const result = await makeRouter(baseLookup, ['home', 'index', '404']).resolve('/');
    expect(result.template).toBe('home');
  });

  it('resolves a post archive to archive', async () => {
    const lookup: ContentLookup = { ...baseLookup, async listTypes() { return [{ slug: 'post', hasArchive: true }]; } };
    const result = await makeRouter(lookup, ['archive', '404']).resolve('/');
    expect(result.template).toBe('archive');
  });

  it('uses a content-specific key before generic keys', async () => {
    const lookup: ContentLookup = {
      ...baseLookup,
      async findByPath(slug) {
        return slug === 'hello' ? { type: 'post', slug, data: {} } : null;
      },
    };
    const result = await makeRouter(lookup, ['post-hello', 'single', 'index', '404']).resolve('/hello');
    expect(result.template).toBe('post-hello');
  });
});
