#!/usr/bin/env bun
// @oktis-works/worker - Main Entry Point

import Redis from 'ioredis';
import { loadConfig } from '@oktis-works/config';
import { bootstrap } from '@oktis-works/core';
import { QueueManager } from './queues/manager.js';
import {
  contentPublishHandler,
  contentUnpublishHandler,
  mediaProcessHandler,
  buildCreateHandler,
  deploymentCreateHandler,
  webhookSendHandler,
  cleanupExpiredSessionsHandler,
  cleanupExpiredAuditLogsHandler,
  cacheInvalidateHandler,
} from './jobs/handlers.js';

async function main() {
  const lifecycle = await bootstrap();
  const config = loadConfig();

  // Worker mode: docker (default, single), pm2 (cluster), k8s (HPA)
  // Quantidade via WORKER_COUNT (default 1), concorrência via WORKER_CONCURRENCY (default 5)
  const mode = config.worker.mode;
  const workerCount = config.worker.count;
  console.log(`[worker] mode=${mode} count=${workerCount} concurrency=${config.worker.concurrency}`);

  const redisUrl = `redis://${config.redis.password ? `:${config.redis.password}@` : ''}${config.redis.host}:${config.redis.port}/${config.redis.db ?? 0}`;
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

  // Concorrência efetiva: mode k8s/pm2 multiplica por count, docker usa valor simples
  const effectiveConcurrency = mode === 'docker' ? config.worker.concurrency : config.worker.concurrency;

  const queueManager = new QueueManager({ redis, concurrency: effectiveConcurrency });

  queueManager.registerHandler('content.publish', contentPublishHandler);
  queueManager.registerHandler('content.unpublish', contentUnpublishHandler);
  queueManager.registerHandler('media.process', mediaProcessHandler);
  queueManager.registerHandler('build.create', buildCreateHandler);
  queueManager.registerHandler('deployment.create', deploymentCreateHandler);
  queueManager.registerHandler('webhook.send', webhookSendHandler);
  queueManager.registerHandler('cleanup.expired_sessions', cleanupExpiredSessionsHandler);
  queueManager.registerHandler('cleanup.expired_audit_logs', cleanupExpiredAuditLogsHandler);
  queueManager.registerHandler('cache.invalidate', cacheInvalidateHandler);

  await queueManager.startWorker('content');
  await queueManager.startWorker('media');
  await queueManager.startWorker('builds');
  await queueManager.startWorker('deployments');
  await queueManager.startWorker('webhooks');
  await queueManager.startWorker('system');

  // `stats.queues` só tem as filas com Queue de PRODUÇÃO criada (o addJob do
  // scheduler cria depois); os workers recém-iniciados ficam em `workers`.
  console.log('Worker started with queues:', queueManager.getStats().workers);

  await scheduleRecurringJobs(queueManager);

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await queueManager.stopAll();
    await redis.quit();
    await lifecycle.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down...');
    await queueManager.stopAll();
    await redis.quit();
    await lifecycle.stop();
    process.exit(0);
  });
}

async function scheduleRecurringJobs(queueManager: QueueManager) {
  await queueManager.addJob('system', 'cleanup.expired_sessions', {}, {
    repeat: {
      every: 60 * 60 * 1000,
    },
  } as any);

  await queueManager.addJob('system', 'cleanup.expired_audit_logs', {}, {
    repeat: {
      every: 60 * 60 * 1000,
    },
  } as any);

  console.log('Recurring jobs scheduled');
}

main().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
