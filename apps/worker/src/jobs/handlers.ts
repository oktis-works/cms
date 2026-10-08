// @oktis-works/worker - Job Handlers

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { getConnection } from '@oktis-works/database';
import { getCache, auditService } from '@oktis-works/core';
import { getEventBus, trackDeploymentProgress, contentPublisher } from '@oktis-works/core';
import type { JobHandler, JobResult } from '../jobs/types.js';

export interface MediaVariantInfo {
  width?: number;
  height?: number;
  bytes: number;
}

interface MediaOperation {
  type: string;
  options: Record<string, unknown>;
}

/** Mesmo contrato do storage da API: UPLOAD_DIR (default "uploads" relativo ao cwd). */
function getUploadDir(): string {
  const dir = process.env['UPLOAD_DIR'] ?? 'uploads';
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/** Mesmo saneamento do storage da API: <tenant>/<uuid>.<ext>. */
function isSafeStoredPath(relPath: string): boolean {
  const [tenant, filename, ...rest] = relPath.split('/');
  return (
    rest.length === 0 &&
    !!tenant &&
    !!filename &&
    /^[A-Za-z0-9_-]{1,64}$/.test(tenant) &&
    /^[A-Za-z0-9_-]{1,64}\.[a-z0-9]{1,10}$/.test(filename)
  );
}

/**
 * Publicação assíncrona (`POST /content/:id/publish?mode=async`).
 * Delega ao contentPublisher do core — mesma paridade do caminho síncrono
 * (versionamento + hooks + eventos + cache). Idempotente: conteúdo já
 * publicado (ex.: caminho síncrono executou antes do job) → sucesso sem efeitos.
 * `enqueue:false`: o job já está em processamento — não re-enfileira.
 */
export const contentPublishHandler: JobHandler = async (job): Promise<JobResult> => {
  const { contentId } = job.payload;

  try {
    await contentPublisher.publish(contentId as string, job.userId ?? 'system', { enqueue: false });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Publish failed';
    if (message.includes('already published')) return { success: true };
    return { success: false, error: message };
  }
};

/** Despublicação assíncrona (`?mode=async`) — mesmas regras do publish. */
export const contentUnpublishHandler: JobHandler = async (job): Promise<JobResult> => {
  const { contentId } = job.payload;

  try {
    await contentPublisher.unpublish(contentId as string, job.userId ?? 'system', { enqueue: false });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unpublish failed';
    if (message.includes('is not published')) return { success: true };
    return { success: false, error: message };
  }
};

/**
 * C1 — processamento REAL de imagens com sharp:
 *   resize    → redimensiona o original (op.options.width/height)
 *   thumbnail → variante `_thumb` (300px) ao lado do original
 *   compress  → re-encode com qualidade (op.options.quality, default 80)
 * metadata recebe as variantes com width/height/bytes reais.
 */
export const mediaProcessHandler: JobHandler = async (job): Promise<JobResult> => {
  const { mediaId, operations } = job.payload;
  const sql = getConnection();

  const mediaResult = await sql.unsafe('SELECT * FROM media WHERE id = $1', [mediaId as string]);
  if (mediaResult.length === 0) {
    return { success: false, error: 'Media not found' };
  }

  const media = mediaResult[0] as Record<string, unknown>;
  const relPath = String(media['path'] ?? '');
  if (!relPath || !isSafeStoredPath(relPath)) {
    return { success: false, error: `Invalid media path: ${relPath}` };
  }

  const absPath = join(getUploadDir(), relPath);
  let buffer: Buffer;
  try {
    buffer = readFileSync(absPath);
  } catch {
    return { success: false, error: `Media file not found on disk: ${relPath}` };
  }

  try {
    const baseMetadata = await sharp(buffer).metadata();
    const variants: Record<string, MediaVariantInfo> = {};
    let currentBuffer = buffer;
    let needsRewrite = false;

    for (const op of (operations ?? []) as MediaOperation[]) {
      switch (op.type) {
        case 'resize': {
          const width = toPositiveInt(op.options['width']);
          const height = toPositiveInt(op.options['height']);
          if (!width && !height) break;
          currentBuffer = await sharp(currentBuffer)
            .resize({ width: width ?? undefined, height: height ?? undefined, fit: 'inside', withoutEnlargement: true })
            .toBuffer();
          const meta = await sharp(currentBuffer).metadata();
          variants['resized'] = { width: meta.width, height: meta.height, bytes: currentBuffer.byteLength };
          needsRewrite = true;
          break;
        }
        case 'thumbnail': {
          const thumbWidth = toPositiveInt(op.options['width']) ?? 300;
          const thumbBuffer = await sharp(currentBuffer)
            .resize({ width: thumbWidth, withoutEnlargement: true })
            .toBuffer();
          const thumbMeta = await sharp(thumbBuffer).metadata();
          writeFileSync(thumbFilename(absPath), thumbBuffer);
          variants['thumb'] = { width: thumbMeta.width, height: thumbMeta.height, bytes: thumbBuffer.byteLength };
          break;
        }
        case 'compress': {
          const quality = toPositiveInt(op.options['quality']) ?? 80;
          currentBuffer = await reencode(currentBuffer, quality);
          const meta = await sharp(currentBuffer).metadata();
          variants['compressed'] = { width: meta.width, height: meta.height, bytes: currentBuffer.byteLength };
          needsRewrite = true;
          break;
        }
        default:
          console.warn(`[media.process] Operação desconhecida ignorada: ${op.type}`);
      }
    }

    if (needsRewrite) {
      writeFileSync(absPath, currentBuffer);
    }

    const metadata = {
      ...((media['metadata'] as Record<string, unknown>) ?? {}),
      processed: true,
      processedAt: new Date().toISOString(),
      width: baseMetadata.width,
      height: baseMetadata.height,
      variants,
    };

    await sql.unsafe('UPDATE media SET metadata = $1::jsonb WHERE id = $2', [metadata, mediaId as string]);

    return { success: true, data: { variants } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Media processing failed';
    console.error(`[media.process] Falha ao processar ${mediaId}:`, message);
    return { success: false, error: message };
  }
};

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** Variante _thumb ao lado do original: <uuid>.<ext> → <uuid>_thumb.<ext>. */
function thumbFilename(absPath: string): string {
  const dot = absPath.lastIndexOf('.');
  return dot === -1 ? `${absPath}_thumb` : `${absPath.slice(0, dot)}_thumb${absPath.slice(dot)}`;
}

/** Re-encode preservando o formato (jpeg/webp/avif usam quality; png usa palette). */
async function reencode(buffer: Buffer, quality: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const image = sharp(buffer);
  switch (meta.format) {
    case 'jpeg':
      return image.jpeg({ quality, mozjpeg: true }).toBuffer();
    case 'webp':
      return image.webp({ quality }).toBuffer();
    case 'avif':
      return image.avif({ quality }).toBuffer();
    case 'png':
      return image.png({ compressionLevel: 9, palette: true }).toBuffer();
    default:
      return buffer;
  }
}

/**
 * C2 — build REAL da imagem Docker via spawnSync:
 *   docker build -f <dockerfile> -t okcms/{buildId}:latest <contexto>
 * Falha de build → status FAILED + error real (stderr do docker).
 * DOCKER_AVAILABLE=false (env) → pula o docker, marca docker_image como NULL
 * e loga claramente (degradação para dev sem docker).
 */
export const buildCreateHandler: JobHandler = async (job): Promise<JobResult> => {
  const { buildId, plugins, theme } = job.payload;
  const sql = getConnection();

  await sql.unsafe(
    "UPDATE builds SET status = 'IN_PROGRESS', started_at = NOW() WHERE id = $1",
    [buildId as string]
  );

  try {
    const dockerfile = generateDockerfile(
      (plugins as Record<string, string>) ?? {},
      (theme as Record<string, string>) ?? {}
    );
    const checksum = computeBuildChecksum(dockerfile);

    // Degradacao: dev sem docker — build "conclui" sem imagem (docker_image NULL)
    if (process.env['DOCKER_AVAILABLE'] === 'false') {
      console.log(
        `[build.create] DOCKER_AVAILABLE=false — docker pulado para o build ${buildId} (docker_image=NULL, degradação para dev sem docker)`
      );
      await sql.unsafe(
        "UPDATE builds SET status = 'COMPLETED', completed_at = NOW(), docker_image = NULL, checksum = $1, build_log = $2 WHERE id = $3",
        [checksum, 'docker skipped: DOCKER_AVAILABLE=false', buildId as string]
      );
      return { success: true, data: { skipped: true, reason: 'DOCKER_AVAILABLE=false' } };
    }

    // Dockerfile num dir temporário (-f absoluto); contexto = cwd do worker
    // (raiz do projeto — os COPY referenciam packages/, plugins/, themes/).
    const tmpDir = mkdtempSync(join(tmpdir(), 'okcms-build-'));
    const dockerfilePath = join(tmpDir, 'Dockerfile');
    writeFileSync(dockerfilePath, dockerfile);

    try {
      const imageTag = `okcms/${buildId}:latest`;
      console.log(`[build.create] docker build -f ${dockerfilePath} -t ${imageTag} ${process.cwd()}`);

      const result = spawnSync('docker', ['build', '-f', dockerfilePath, '-t', imageTag, process.cwd()], {
        encoding: 'utf-8',
        timeout: 10 * 60 * 1000,
        maxBuffer: 16 * 1024 * 1024,
      });

      const stdoutTail = (result.stdout ?? '').split('\n').slice(-40).join('\n');
      const stderr = result.stderr ?? '';

      if (result.error || result.status !== 0) {
        const message =
          result.error?.message ??
          (stderr.trim() || stdoutTail.trim() || `docker build exited with status ${result.status}`);
        throw new Error(message);
      }

      await sql.unsafe(
        "UPDATE builds SET status = 'COMPLETED', completed_at = NOW(), docker_image = $1, checksum = $2, build_log = $3 WHERE id = $4",
        [imageTag, checksum, stdoutTail, buildId as string]
      );

      return { success: true, data: { image: imageTag, checksum } };
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Build failed';
    console.error(`[build.create] Falha no build ${buildId}:`, message);

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
    // Pipeline build → deployment: com o build EXISTENTE e ainda não COMPLETED,
    // o deploy falha → retry do BullMQ (backoff exponencial) até o build concluir.
    // Build inexistente segue o fluxo legado (sem gate).
    const buildRows = await sql.unsafe('SELECT status FROM builds WHERE id = $1', [buildId as string]);
    const buildStatus = (buildRows[0] as { status?: string } | undefined)?.status;
    if (buildRows.length > 0 && buildStatus !== 'COMPLETED') {
      throw new Error(`Build ${buildId} ainda não está COMPLETED (status: ${buildStatus}) — retry agendado`);
    }

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

  const body = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  const authType = String(webhook['auth_type'] ?? 'hmac_sha256');
  const authConfig = (webhook['auth_config'] && typeof webhook['auth_config'] === 'object'
    ? webhook['auth_config']
    : {}) as Record<string, unknown>;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': String(event),
  };

  if (authType === 'bearer' && authConfig['token']) {
    headers['Authorization'] = `Bearer ${String(authConfig['token'])}`;
  } else if (authType === 'basic' && authConfig['username'] && authConfig['password']) {
    headers['Authorization'] = `Basic ${Buffer.from(`${String(authConfig['username'])}:${String(authConfig['password'])}`).toString('base64')}`;
  } else if (authType === 'api_key' && authConfig['headerName'] && authConfig['value']) {
    headers[String(authConfig['headerName'])] = String(authConfig['value']);
  } else if (authType === 'hmac_sha256') {
    const secret = String(authConfig['secret'] ?? webhook['secret'] ?? '');
    const signatureHeader = String(authConfig['signatureHeader'] ?? 'X-Webhook-Signature');
    headers[signatureHeader] = generateSignature(body, secret);
  }

  try {
    const response = await fetch(webhook['url'] as string, {
      method: 'POST',
      headers,
      body,
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

export const cleanupExpiredAuditLogsHandler: JobHandler = async (): Promise<JobResult> => {
  const sql = getConnection();
  const rows = await sql.unsafe('SELECT value FROM settings WHERE key = $1 ORDER BY updated_at DESC LIMIT 1', ['auditLogRetentionDays']);
  const configured = rows[0] as { value?: unknown } | undefined;
  const raw = configured?.value;
  const value = typeof raw === 'number' ? raw : Number(raw);
  const retentionDays = Number.isFinite(value) && value > 0 ? value : 90;
  const deleted = await auditService.purgeExpired(retentionDays);
  console.log(`Cleaned up ${deleted} expired audit logs`);
  return { success: true, data: { deleted, retentionDays } };
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
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}
