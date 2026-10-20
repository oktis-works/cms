// @oktis-works/core - Mail service (Item 12 do plugin-parity-plan)
//
// Durable outbox for `api.mail.send`: rows land in `mails` (QUEUED), the
// worker's mail.deliver job delivers through the configured transport
// (MAIL_TRANSPORT, default 'log') and marks SENT/FAILED. Rate limit is
// per plugin+tenant (default 60/min, env MAIL_RATE_PER_MINUTE) — over the
// cap the send is refused with an audit entry (never throws to the plugin).
// Queue unavailable → the outbox row stays QUEUED (never lost).

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import { auditService } from '../observability/audit.js';
import { queueProducer } from '../queue/producer.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_PER_MINUTE = 60;

interface RateBucket {
  windowStart: number;
  count: number;
}

export interface MailSendInput {
  tenantId: string | null;
  pluginName: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  params?: Record<string, unknown>;
}

export class MailService {
  private buckets = new Map<string, RateBucket>();

  /** Per plugin+tenant minute window (env MAIL_RATE_PER_MINUTE, default 60). */
  private rateLimited(key: string): boolean {
    const max = Number(process.env['MAIL_RATE_PER_MINUTE'] ?? DEFAULT_RATE_PER_MINUTE) || DEFAULT_RATE_PER_MINUTE;
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
      this.buckets.set(key, { windowStart: now, count: 1 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > max;
  }

  /** Validates + persists + audits + enqueues delivery. Returns false when refused. */
  async enqueue(input: MailSendInput): Promise<boolean> {
    if (typeof input.to !== 'string' || !EMAIL_PATTERN.test(input.to)) {
      throw new Error(`Invalid recipient email "${String(input.to)}"`);
    }
    if (typeof input.subject !== 'string' || input.subject.trim().length === 0) {
      throw new Error('Mail "subject" is required');
    }
    if (input.subject.length > 998) {
      throw new Error('Mail "subject" too long (max 998 chars)');
    }
    if (!input.html && !input.text) {
      throw new Error('Mail requires html or text body');
    }

    const sql = getConnection();
    const rateKey = `${input.tenantId ?? 'platform'}:${input.pluginName}`;

    if (this.rateLimited(rateKey)) {
      await this.audit(input.tenantId, input.pluginName, 'plugin.mail.rate_limited', input.to, { subject: input.subject });
      return false;
    }

    const id = randomUUID();
    await sql.unsafe(
      `INSERT INTO mails (id, tenant_id, plugin_name, to_email, subject, html, text, template, params, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'QUEUED')`,
      [
        id,
        input.tenantId,
        input.pluginName,
        input.to,
        input.subject,
        input.html ?? null,
        input.text ?? null,
        input.template ?? null,
        input.params ?? null,
      ]
    );

    await this.audit(input.tenantId, input.pluginName, 'plugin.mail.send', input.to, {
      subject: input.subject,
      template: input.template ?? null,
    });

    // Delivery job — outbox semantics: enqueue failure leaves the row QUEUED.
    await queueProducer.enqueue('mail.deliver', { mailId: id }, { tenantId: input.tenantId ?? 'default' });
    return true;
  }

  /**
   * Worker delivery pass: loads the row, hands it to the configured transport
   * and marks SENT/FAILED. Transport: MAIL_TRANSPORT ('log' default — no SMTP
   * dependency; adapters can hook the same contract later).
   */
  async deliver(mailId: string): Promise<boolean> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT * FROM mails WHERE id = $1', [mailId]);
    const mail = rows[0] as unknown as
      | { id: string; to_email: string; subject: string; html: string | null; text: string | null; status: string }
      | undefined;
    if (!mail || mail.status !== 'QUEUED') return false;

    const transport = (process.env['MAIL_TRANSPORT'] ?? 'log').toLowerCase();
    try {
      if (transport === 'log') {
        console.log(
          `[mail:log-transport] to=${mail.to_email} subject="${mail.subject}" bytes=${(mail.html ?? mail.text ?? '').length}`
        );
      } else {
        throw new Error(`Unknown MAIL_TRANSPORT "${transport}" (supported: log)`);
      }
      await sql.unsafe(`UPDATE mails SET status = 'SENT', attempts = attempts + 1, sent_at = NOW() WHERE id = $1`, [mailId]);
      return true;
    } catch (error) {
      await sql.unsafe(`UPDATE mails SET status = 'FAILED', attempts = attempts + 1, error = $2 WHERE id = $1`, [
        mailId,
        error instanceof Error ? error.message : String(error),
      ]);
      return false;
    }
  }

  private async audit(
    tenantId: string | null,
    pluginName: string,
    action: string,
    resource: string,
    changes: Record<string, unknown>
  ): Promise<void> {
    try {
      await auditService.record({
        tenantId: tenantId ?? undefined,
        action,
        resourceType: 'mail',
        resourceId: resource,
        changes: { plugin: pluginName, ...changes },
      });
    } catch {
      // audit failures never block the operation (logged inside the service)
    }
  }
}

export const mailService = new MailService();
