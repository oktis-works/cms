import { describe, it, expect, beforeEach } from 'vitest';

describe('MemoryCache', () => {
  let cache: any;

  beforeEach(async () => {
    const mod = await import('./index.js');
    cache = new mod.MemoryCache({ ttl: 3600, prefix: 'test:' });
  });

  it('should set and get values', async () => {
    await cache.set('key1', { name: 'test' }, 60);
    const value = await cache.get('key1');
    expect(value).toEqual({ name: 'test' });
  });

  it('should return null for missing keys', async () => {
    const value = await cache.get('nonexistent');
    expect(value).toBeNull();
  });

  it('should delete values', async () => {
    await cache.set('key1', 'value1', 60);
    await cache.del('key1');
    const value = await cache.get('key1');
    expect(value).toBeNull();
  });

  it('should support TTL expiration', async () => {
    await cache.set('key1', 'value1', 0); // 0 seconds = expired immediately
    // Small delay to ensure expiration
    await new Promise(resolve => setTimeout(resolve, 10));
    const value = await cache.get('key1');
    expect(value).toBeNull();
  });

  it('should list keys by pattern', async () => {
    await cache.set('user:1', 'alice', 60);
    await cache.set('user:2', 'bob', 60);
    await cache.set('post:1', 'hello', 60);

    const keys = await cache.keys('user:*');
    expect(keys).toHaveLength(2);
    expect(keys).toContain('user:1');
    expect(keys).toContain('user:2');
  });

  it('should clear all keys', async () => {
    await cache.set('key1', 'value1', 60);
    await cache.set('key2', 'value2', 60);
    await cache.clear();
    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBeNull();
  });

  it('should report size', async () => {
    expect(cache.size).toBe(0);
    await cache.set('key1', 'value1', 60);
    expect(cache.size).toBe(1);
  });
});
