// @oktis-works/core - Tagged cache invalidation (Item 23 do plano de performance)
//
// Tag→keys index over any CacheAdapter: entries written via setWithTags are
// registered under each tag (`tag:<name>` → key list, read-modify-write) and
// invalidateTag removes every registered key plus the tag entry itself.
// Race note: concurrent writers may lose a key registration (last write
// wins) — acceptable for cache semantics (worst case: a stale entry until
// its TTL).

import type { CacheAdapter } from './index.js';
import { getCache } from './index.js';

const TAG_KEY_PREFIX = 'tag:';

export class TaggedCacheIndex {
  constructor(private cache: CacheAdapter) {}

  /** Writes the entry and registers it under every tag. */
  async setWithTags<T>(key: string, value: T, tags: readonly string[], ttl?: number): Promise<void> {
    await this.cache.set(key, value, ttl);
    for (const tag of tags) {
      if (!tag) continue;
      const indexKey = `${TAG_KEY_PREFIX}${tag}`;
      const existing = (await this.cache.get<string[]>(indexKey)) ?? [];
      if (!existing.includes(key)) {
        existing.push(key);
      }
      // Tag index outlives the entry by a small margin so late readers can
      // still find (and delete) the key before it expires naturally.
      await this.cache.set(indexKey, existing, (ttl ?? 60) + 30);
    }
  }

  /** Deletes every key registered under the tag plus the tag entry. */
  async invalidateTag(tag: string): Promise<number> {
    if (!tag) return 0;
    const indexKey = `${TAG_KEY_PREFIX}${tag}`;
    const keys = (await this.cache.get<string[]>(indexKey)) ?? [];
    let removed = 0;
    for (const key of keys) {
      await this.cache.del(key);
      removed += 1;
    }
    await this.cache.del(indexKey);
    return removed;
  }
}

let _taggedIndex: TaggedCacheIndex | null = null;

/** Shared index over the process cache (same adapter as getCache()). */
export function getTaggedCacheIndex(): TaggedCacheIndex {
  if (!_taggedIndex) {
    _taggedIndex = new TaggedCacheIndex(getCache());
  }
  return _taggedIndex;
}
