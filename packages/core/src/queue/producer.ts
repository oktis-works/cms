// @oktis-works/core - Queue Producer (produção de jobs BullMQ)
//
// Único ponto de produção de jobs da aplicação. A fila é OPCIONAL:
// Redis indisponível → degradação silenciosa (log espaçado, nenhum throw) —
// a API continua funcionando sem background jobs (TASK A3).

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadConfig, type RedisConfig } from '@oktis-works/config';

/** Job types produzidos pelo núcleo (consumidos pelo worker). */
export type JobType =
  | 'content.publish'
  | 'content.unpublish'
  | 'media.process'
  | 'build.create'
  | 'deployment.create'
  | 'webhook.send'
  | 'cache.invalidate'
  | 'cleanup.expired_sessions';

/** jobType → fila BullMQ (o worker registra um worker por fila). */
const QUEUE_BY_JOB_TYPE: Record<JobType, string> = {
  'content.publish': 'content',
  'content.unpublish': 'content',
  'media.process': 'media',
  'build.create': 'builds',
  'deployment.create': 'deployments',
  'webhook.send': 'webhooks',
  'cache.invalidate': 'system',
  'cleanup.expired_sessions': 'system',
};

export interface EnqueueOptions {
  tenantId?: string;
  userId?: string;
  jobId?: string;
  delay?: number;
  priority?: number;
}

/** Contrato dos dados gravados no job (o worker mapeia para JobData). */
export interface JobEnvelope {
  payload: Record<string, unknown>;
  tenantId: string;
  userId?: string;
}

function buildRedisUrl(redis: RedisConfig): string {
  const auth = redis.password ? `:${redis.password}@` : '';
  return `redis://${auth}${redis.host}:${redis.port}/${redis.db ?? 0}`;
}

const WARN_INTERVAL_MS = 30_000;

export class QueueProducer {
  private queues = new Map<string, Queue>();
  private connection: Redis | null = null;
  private redisDisabled = false;
  private lastWarnAt = 0;

  /**
   * Conexão lazy: só abre quando o primeiro job é enfileirado.
   * enableOfflineQueue:false → comandos falham na hora se o Redis estiver fora
   * (degradação silenciosa em vez de travar a request).
   */
  private ensureConnection(): Redis | null {
    if (this.redisDisabled) return null;
    if (this.connection) return this.connection;

    try {
      const config = loadConfig();
      const redisCfg = config.redis;

      if (redisCfg.enabled === false || redisCfg.host === 'disabled') {
        this.redisDisabled = true;
        return null;
      }

      this.connection = new Redis(buildRedisUrl(redisCfg), {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2_000)),
      });
      // Sem listener de 'error' o ioredis lança unhandled error event.
      this.connection.on('error', () => {
        /* silencioso: fila é opcional (degradação A3) */
      });

      return this.connection;
    } catch {
      this.redisDisabled = true;
      return null;
    }
  }

  private getQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, { connection: this.connection as Redis });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  /**
   * Enfileira um job. Retorna true quando enfileirado; false quando a fila
   * está desativada/indisponível — NUNCA lança (fila é opcional).
   */
  async enqueue(
    jobType: JobType | string,
    payload: Record<string, unknown>,
    options: EnqueueOptions = {}
  ): Promise<boolean> {
    const queueName = QUEUE_BY_JOB_TYPE[jobType as JobType];
    if (!queueName) {
      return false;
    }

    const connection = this.ensureConnection();
    if (!connection) return false;

    try {
      if (connection.status === 'wait' || connection.status === 'end') {
        await connection.connect().catch(() => {
          throw new Error('redis connect failed');
        });
      }

      const envelope: JobEnvelope = {
        payload,
        tenantId: options.tenantId ?? 'default',
        userId: options.userId,
      };

      await this.getQueue(queueName).add(jobType, envelope, {
        jobId: options.jobId,
        delay: options.delay,
        priority: options.priority,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: false,
      });

      return true;
    } catch (error) {
      this.warnDegraded(jobType, error);
      return false;
    }
  }

  /** Log espaçado (1x/30s): degradação visível sem poluir o log. */
  private warnDegraded(jobType: string, error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_INTERVAL_MS) return;
    this.lastWarnAt = now;

    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[queue-producer] Fila indisponível — job "${jobType}" não enfileirado (API segue degradada sem background): ${message}`
    );
  }

  async close(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close().catch(() => undefined);
    }
    this.queues.clear();
    if (this.connection) {
      await this.connection.quit().catch(() => undefined);
      this.connection = null;
    }
  }
}

export const queueProducer = new QueueProducer();

/** Atalho funcional para o singleton (usado por publisher, webhooks, rotas). */
export function enqueueJob(
  jobType: JobType | string,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {}
): Promise<boolean> {
  return queueProducer.enqueue(jobType, payload, options);
}
