// @oktis-works/core - Tagged cache index tests (Item 23)

import { describe, it, expect } from 'vitest';
import { MemoryCache } from './index.js';
import { TaggedCacheIndex } from './tags.js';

describe('TaggedCacheIndex (Item 23)', () => {
  it('registers entries under tags and invalidates every key on the tag', async () => {
    const cache = new MemoryCache({ ttl: 60 } as never);
    const index = new TaggedCacheIndex(cache);

    await index.setWithTags('content:a', { id: 'a' }, ['content:a', 'content:type:post']);
    await index.setWithTags('content:b', { id: 'b' }, ['content:b', 'content:type:post']);

    // both entries readable
    expect(await cache.get('content:a')).toEqual({ id: 'a' });
    expect(await cache.get('content:b')).toEqual({ id: 'b' });

    // one key re-registered under the same tag is not duplicated
    const removed = await index.invalidateTag('content:type:post');
    expect(removed).toBe(2);

    expect(await cache.get('content:a')).toBeNull();
    expect(await cache.get('content:b')).toBeNull();
    // the tag entry itself is gone
    expect(await cache.get('tag:content:type:post')).toBeNull();
  });

  it('keeps other tags untouched when invalidating one', async () => {
    const cache = new MemoryCache({ ttl: 60 } as never);
    const index = new TaggedCacheIndex(cache);

    await index.setWithTags('content:a', { id: 'a' }, ['content:a', 'content:type:post']);
    await index.setWithTags('content:b', { id: 'b' }, ['content:b']);

    await index.invalidateTag('content:a');

    expect(await cache.get('content:a')).toBeNull();
    expect(await cache.get('content:b')).toEqual({ id: 'b' });
  });

  it('ignores empty tags and returns 0 removals for unknown tags', async () => {
    const cache = new MemoryCache({ ttl: 60 } as never);
    const index = new TaggedCacheIndex(cache);

    await index.setWithTags('k', 1, ['']);
    expect(await cache.get('k')).toBe(1);

    expect(await index.invalidateTag('never-registered')).toBe(0);
  });
});
