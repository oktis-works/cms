// @oktis-works/core - Webhook secret rotation (Item 19 do plugin-parity-plan)
//
// Versioned secrets for webhook signing: `rotate` creates the next version,
// deactivates the previous one (keeping it recorded with rotated_at so
// consumers have a 24h grace window to swap the key) and returns the new
// secret exactly once. Signing itself happens in the worker, which picks the
// newest active version and stamps X-Webhook-Secret-Version.

import { randomUUID, randomBytes } from 'node:crypto';
import { getConnection } from '@oktis-works/database';

export interface WebhookSecretVersion {
  id: string;
  webhookId: string;
  version: number;
  isActive: boolean;
  rotatedAt: Date | null;
  createdAt: Date;
  /** Only present right after rotation (never listed). */
  secret?: string;
}

export class WebhookSecretService {
  /**
   * Rotates the signing secret: creates version N+1 as the only active one
   * and stamps the previous version with rotated_at (24h grace for
   * consumers). Returns the new secret ONCE — it is never listed again.
   */
  async rotate(webhookId: string): Promise<WebhookSecretVersion | null> {
    const sql = getConnection();

    const webhook = await sql.unsafe('SELECT id FROM webhooks WHERE id = $1', [webhookId]);
    if (webhook.length === 0) return null;

    const versionRows = await sql.unsafe(
      'SELECT COALESCE(MAX(version), 0)::int AS max_version FROM webhook_secrets WHERE webhook_id = $1',
      [webhookId]
    );
    const nextVersion = Number((versionRows[0] as { max_version?: number } | undefined)?.max_version ?? 0) + 1;

    // Deactivate previous versions (kept for the 24h grace window).
    await sql.unsafe(
      'UPDATE webhook_secrets SET is_active = false, rotated_at = NOW() WHERE webhook_id = $1 AND is_active = true',
      [webhookId]
    );

    const secret = randomBytes(32).toString('hex');
    const id = randomUUID();
    await sql.unsafe(
      'INSERT INTO webhook_secrets (id, webhook_id, secret, version, is_active) VALUES ($1, $2, $3, $4, true)',
      [id, webhookId, secret, nextVersion]
    );

    return { id, webhookId, version: nextVersion, isActive: true, rotatedAt: null, createdAt: new Date(), secret };
  }

  /** Versioned history WITHOUT the secret values (safe to list). */
  async listVersions(webhookId: string): Promise<Array<Omit<WebhookSecretVersion, 'secret'>>> {
    const sql = getConnection();
    const rows = await sql.unsafe(
      `SELECT id, webhook_id, version, is_active, rotated_at, created_at
       FROM webhook_secrets WHERE webhook_id = $1 ORDER BY version DESC`,
      [webhookId]
    );
    return rows as unknown as Array<Omit<WebhookSecretVersion, 'secret'>>;
  }

  /** Newest active secret for signing (worker-side; legacy fallback). */
  async getActiveSecret(webhookId: string): Promise<{ secret: string; version: number } | null> {
    const sql = getConnection();
    const rows = await sql.unsafe(
      `SELECT secret, version FROM webhook_secrets
       WHERE webhook_id = $1 AND is_active = true ORDER BY version DESC LIMIT 1`,
      [webhookId]
    );
    const row = rows[0] as unknown as { secret: string; version: number } | undefined;
    return row ? { secret: row.secret, version: row.version } : null;
  }

  /**
   * Records a delivery that exhausted its retries into the dead-letter
   * table — one row per failed delivery job (BullMQ already applied the
   * exponential backoff before the handler gives up).
   */
  async recordDeadLetter(webhookId: string, event: string, payload: unknown, error: string): Promise<void> {
    const sql = getConnection();
    await sql.unsafe(
      `INSERT INTO webhook_dead_letters (webhook_id, event, payload, error, attempts)
       VALUES ($1, $2, $3::jsonb, $4, 1)`,
      [webhookId, event, JSON.stringify(payload ?? {}), error]
    );
  }
}

export const webhookSecretService = new WebhookSecretService();
