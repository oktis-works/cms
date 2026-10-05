// @oktis-works/core - Cache Layer (Redis Cluster opcional + fallback memória)
// Se REDIS_HOST=disabled ou Redis indisponível, usa MemoryCache para não quebrar o CMS.
// Se REDIS_CLUSTER=true, usa ioredis Cluster; senão single.

import type { CacheConfig, RedisConfig } from '@oktis-works/config';

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const resolvedTtl = ttl ?? this.config.ttl;
    const expiresAt = Date.now() + resolvedTtl * 1000;

    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.store.keys());
    if (!pattern) return allKeys;

    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return allKeys.filter(key => regex.test(key));
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }

    return removed;
  }

  get size(): number {
    return this.store.size;
  }
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  /** Lista chaves (glob opcional, ex.: `user:*`) sem o prefixo. */
  keys(pattern?: string): Promise<string[]>;
  /** Remove entradas expiradas. Redis já expira via TTL — implementação pode retornar 0. */
  cleanup(): Promise<number>;
}

let _cache: CacheAdapter | null = null;

export function getCache(): CacheAdapter {
  if (!_cache) {
    throw new Error('Cache not initialized. Call createCache() first.');
  }
  return _cache;
}

export function createCache(config: CacheConfig, redisConfig?: RedisConfig): CacheAdapter {
  // Fallback memória se Redis desabilitado
  if (!redisConfig || redisConfig.enabled === false || redisConfig.host === 'disabled') {
    _cache = new MemoryCache(config);
    return _cache;
  }
  // Tenta Redis, fallback memória em falha — CMS nunca fica sem cache
  try {
    // Lazy import para não quebrar se ioredis não instalado
    const Redis = require('ioredis');
    const redis = redisConfig.cluster
      ? new Redis.Cluster([{ host: redisConfig.host, port: redisConfig.port }], { scaleReads: 'slave' })
      : new Redis({ host: redisConfig.host, port: redisConfig.port, password: redisConfig.password, db: redisConfig.db });
    const adapter: CacheAdapter = {
      get: async (k) => {
        const v = await redis.get(config.prefix + k);
        return v ? JSON.parse(v) : null;
      },
      set: async (k, v, ttl) => {
        const t = ttl ?? config.ttl;
        await redis.set(config.prefix + k, JSON.stringify(v), 'EX', t);
      },
      del: async (k) => { await redis.del(config.prefix + k); },
      has: async (k) => (await redis.exists(config.prefix + k)) === 1,
      keys: async (pattern) => {
        const found = await redis.keys(config.prefix + (pattern ?? '*'));
        return found.map((k: string) => (k.startsWith(config.prefix) ? k.slice(config.prefix.length) : k));
      },
      // Redis expira chaves via TTL nativamente — nada a limpar manualmente.
      cleanup: async () => 0,
    };
    _cache = adapter;
    return _cache;
  } catch {
    _cache = new MemoryCache(config);
    return _cache;
  }
}
