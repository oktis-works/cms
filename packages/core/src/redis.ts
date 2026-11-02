// @oktis-works/core - Redis Client (singleton, optional)

import { createClient } from 'redis';
import { loadConfig } from '@oktis-works/config';

type RedisClient = ReturnType<typeof createClient>;

let _redisClient: RedisClient | null = null;
let _initPromise: Promise<RedisClient | null> | null = null;

export function getRedisClient(): RedisClient | null {
  return _redisClient;
}

export async function initRedisClient(): Promise<RedisClient | null> {
  if (_redisClient) return _redisClient;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const config = loadConfig();
    if (config.redis.enabled === false || config.redis.host === 'disabled') {
      return null;
    }

    try {
      const url = config.redis.password
        ? `redis://:${config.redis.password}@${config.redis.host}:${config.redis.port}/${config.redis.db ?? 0}`
        : `redis://${config.redis.host}:${config.redis.port}/${config.redis.db ?? 0}`;

      const client = createClient({ url });
      client.on('error', (err: Error) => console.error('[Redis] Client error:', err));
      await client.connect();
      _redisClient = client;
      return client;
    } catch (err) {
      console.warn('[Redis] Failed to connect, rate limiting will use in-memory fallback:', err instanceof Error ? err.message : String(err));
      return null;
    }
  })();

  return _initPromise;
}

export async function closeRedisClient(): Promise<void> {
  if (_redisClient) {
    await _redisClient.quit();
    _redisClient = null;
    _initPromise = null;
  }
}

export function isRedisAvailable(): boolean {
  return _redisClient !== null && _redisClient.isOpen;
}
