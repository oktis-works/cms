// @oktis-works/worker - Job Handlers

import { createHash, randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import { getCache } from '@oktis-works/core';
import { getEventBus, trackDeploymentProgress } from '@oktis-works/core';
import type { JobHandler, JobResult } from '../jobs/types.js';

export const contentPublishHandler: JobHandler = async (job): Promise<JobResult> => {
  const { contentId } = job.payload;
  const sql = getConnection();

  await sql.unsafe(
    "UPDATE content SET status = 'PUBLISHED', published_at = NOW() WHERE id = $1",
    [contentId as string]
  );

  const eventBus = getEventBus();
  await eventBus.emit({
    id: randomUUID(),
    type: 'content.published',
    aggregateType: 'content',
    aggregateId: contentId as string,
    payload: { contentId },
    processed: false,
    createdAt: new Date(),
  });

  const cache = getCache();
  await cache.del(`content:${contentId}`);

  return { success: true };
};

export const contentUnpublishHandler: JobHandler = async (job): Promise<JobResult> => {
  const { contentId } = job.payload;
  const sql = getConnection();

  await sql.unsafe(
    "UPDATE content SET status = 'DRAFT', published_at = NULL WHERE id = $1",
    [contentId as string]
  );

  const eventBus = getEventBus();
  await eventBus.emit({
    id: randomUUID(),
    type: 'content.unpublished',
    aggregateType: 'content',
    aggregateId: contentId as string,
    payload: { contentId },
    processed: false,
    createdAt: new Date(),
  });

  const cache = getCache();
  await cache.del(`content:${contentId}`);

  return { success: true };
};

export const mediaProcessHandler: JobHandler = async (job): Promise<JobResult> => {
  const { mediaId, operations } = job.payload;
  const sql = getConnection();

  const mediaResult = await sql.unsafe('SELECT * FROM media WHERE id = $1', [mediaId as string]);
  if (mediaResult.length === 0) {
    return { success: false, error: 'Media not found' };
  }

  for (const op of operations as Array<{ type: string; options: Record<string, unknown> }>) {
    console.log(`Processing media ${mediaId}: ${op.type}`, op.options);
  }

  await sql.unsafe(
    "UPDATE media SET metadata = metadata || $1::jsonb WHERE id = $2",
    [JSON.stringify({ processed: true, processedAt: new Date().toISOString() }), mediaId as string]
  );

  return { success: true };
};

export const buildCreateHandler: JobHandler = async (job): Promise<JobResult> => {
  const { buildId, plugins, theme } = job.payload;
  const sql = getConnection();

  await sql.unsafe(
    "UPDATE builds SET status = 'IN_PROGRESS', started_at = NOW() WHERE id = $1",
    [buildId as string]
  );

  try {
    const dockerfile = generateDockerfile(plugins as Record<string, string>, theme as Record<string, string>);
    const checksum = computeBuildChecksum(dockerfile);

    console.log(`Building Docker image for build ${buildId} (checksum ${checksum.slice(0, 12)})`);

    await sql.unsafe(
      "UPDATE builds SET status = 'COMPLETED', completed_at = NOW(), docker_image = $1, checksum = $2 WHERE id = $3",
      [`okcms/${buildId}:latest`, checksum, buildId as string]
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Build failed';

    await sql.unsafe(
      "UPDATE builds SET status = 'FAILED', completed_at = NOW(), error = $1 WHERE id = $2",
      [message, buildId as string]
    );

    return { success: false, error: message };
  }
};

export const deploymentCreateHandler: JobHandler = async (job): Promise<JobResult> => {
  const { deploymentId, buildId } = job.payload;
  const sql = getConnection();

  await sql.unsafe(
    "UPDATE deployments SET status = 'DEPLOYING', started_at = NOW() WHERE id = $1",
    [deploymentId as string]
  );
  trackDeploymentProgress(deploymentId as string, 'deploying');

  try {
    console.log(`Deploying build ${buildId} as deployment ${deploymentId}`);

    // RULE-health-check-protocol: readiness/liveness gate antes de ativar.
    // Sem HEALTH_CHECK_URL configurada, ativa direto (deploy local/dev).
    const healthUrl = process.env['HEALTH_CHECK_URL'];
    if (healthUrl) {
      const healthy = await checkHealthWithRetries(healthUrl, 3);
      if (!healthy) {
        await sql.unsafe(
          "UPDATE deployments SET status = 'FAILED', completed_at = NOW(), health_check_status = 'FAILED', error = $1 WHERE id = $2",
          [`Health check failed after retries: ${healthUrl}`, deploymentId as string]
        );
        trackDeploymentProgress(deploymentId as string, 'failed');
        await rollbackPreviousDeployment(sql as never, deploymentId as string);
        return { success: false, error: 'health check failed — previous active deployment restored' };
      }
    }

    await sql.unsafe(
      "UPDATE deployments SET status = 'ACTIVE', completed_at = NOW(), health_check_status = 'HEALTHY' WHERE id = $1",
      [deploymentId as string]
    );
    trackDeploymentProgress(deploymentId as string, 'active');

    const eventBus = getEventBus();
    await eventBus.emit({
      id: randomUUID(),
      type: 'deployment.completed',
      aggregateType: 'deployment',
      aggregateId: deploymentId as string,
      payload: { deploymentId, buildId },
      processed: false,
      createdAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deployment failed';

    await sql.unsafe(
      "UPDATE deployments SET status = 'FAILED', completed_at = NOW(), error = $1 WHERE id = $2",
      [message, deploymentId as string]
    );

    return { success: false, error: message };
  }
};

export const webhookSendHandler: JobHandler = async (job): Promise<JobResult> => {
  const { webhookId, event, data } = job.payload;
  const sql = getConnection();

  const webhookResult = await sql.unsafe('SELECT * FROM webhooks WHERE id = $1', [webhookId as string]);
  if (webhookResult.length === 0) {
    return { success: false, error: 'Webhook not found' };
  }

  const webhook = webhookResult[0] as Record<string, unknown>;

  const subscribedEvents = webhook['events'] as string[];
  if (!subscribedEvents.includes(event as string) && !subscribedEvents.includes('*')) {
    return { success: true };
  }

  try {
    const response = await fetch(webhook['url'] as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event as string,
        'X-Webhook-Signature': generateSignature(JSON.stringify(data), webhook['secret'] as string),
      },
      body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook failed';
    return { success: false, error: message };
  }
};

export const cleanupExpiredSessionsHandler: JobHandler = async (): Promise<JobResult> => {
  const sql = getConnection();
  const result = await sql.unsafe('DELETE FROM sessions WHERE expires_at < NOW()');
  console.log(`Cleaned up ${result.length} expired sessions`);
  return { success: true };
};

export const cacheInvalidateHandler: JobHandler = async (job): Promise<JobResult> => {
  const { pattern } = job.payload;
  const cache = getCache();
  const keys = await cache.keys(pattern as string);

  for (const key of keys) {
    await cache.del(key);
  }

  console.log(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
  return { success: true };
};

/**
 * RULE-docker-layer-optimization: ordem das camadas fixa, do menos ao mais volátil:
 * runtime → deps do core → core → deps dos plugins → plugins → deps do theme → theme.
 * Mudanças em plugins/theme nunca invalidam o cache das camadas do core.
 */
export function generateDockerfile(
  plugins: Record<string, string> = {},
  theme: Record<string, string> = {}
): string {
  const lines: string[] = [
    'FROM oven/bun:1-alpine AS runtime',
    'WORKDIR /app',
    '',
    '# ── 1/5 core dependencies (raramente mudam) ──',
    'COPY package.json bun.lock ./',
    'RUN bun install --production --frozen-lockfile',
    'COPY packages/core/dist ./packages/core/dist',
    '',
  ];

  const pluginNames = Object.keys(plugins).sort();
  if (pluginNames.length > 0) {
    lines.push('# ── 2/5 plugin dependencies ──');
    for (const name of pluginNames) {
      lines.push(`COPY plugins/${name}/package.json ./plugins/${name}/`);
    }
    lines.push('RUN bun install --production --frozen-lockfile');
    lines.push('# ── 3/5 plugins ──');
    for (const name of pluginNames) {
      lines.push(`COPY plugins/${name} ./plugins/${name}`);
    }
    lines.push('');
  }

  if (theme && Object.keys(theme).length > 0) {
    const themeName = Object.keys(theme).sort()[0]!;
    lines.push('# ── 4/5 theme dependencies ──');
    lines.push(`COPY themes/${themeName}/package.json ./themes/${themeName}/`);
    lines.push('RUN bun install --production --frozen-lockfile');
    lines.push('# ── 5/5 theme (camada mais volátil por último) ──');
    lines.push(`COPY themes/${themeName} ./themes/${themeName}`);
    lines.push('');
  }

  lines.push('EXPOSE 3000', 'CMD ["bun", "packages/core/dist/bootstrap/index.js"]');
  return lines.join('\n');
}

/** RULE-build-immutability: checksum determinístico do artefato de build. */
export function computeBuildChecksum(dockerfile: string): string {
  return createHash('sha256').update(dockerfile).digest('hex');
}

/** RULE-health-check-protocol: readiness probe com backoff curto. */
export async function checkHealthWithRetries(url: string, attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return true;
    } catch {
      // retry
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return false;
}

/** Falha no health check → rollback automático para o último deployment ACTIVE anterior. */
async function rollbackPreviousDeployment(sql: { unsafe(q: string, v?: unknown[]): Promise<unknown[]> }, failedId: string): Promise<void> {
  const rows = await sql.unsafe(
    `SELECT d.id FROM deployments d
     WHERE d.status IN ('ROLLED_BACK', 'ACTIVE')
       AND d.id <> $1
     ORDER BY d.created_at DESC LIMIT 1`,
    [failedId]
  );
  const previousId = (rows[0] as { id?: string } | undefined)?.id;
  if (!previousId) {
    console.error('Auto-rollback skipped: no previous deployment found');
    return;
  }
  await sql.unsafe("UPDATE deployments SET status = 'ACTIVE' WHERE id = $1", [previousId]);
  console.log(`Auto-rollback: deployment ${previousId} reactivated after failure of ${failedId}`);
}

function generateSignature(payload: string, secret: string): string {
  return `sha256=${Buffer.from(secret).toString('hex')}`;
}
