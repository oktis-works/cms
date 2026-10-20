// @oktis-works/core - MailService tests (Item 12)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: { queries: Array<{ text: string; values: unknown[] }>; results: unknown[][] } = {
  queries: [],
  results: [],
};

const auditCalls: Array<{ action: string }> = [];
const enqueued: Array<{ jobType: string; payload: Record<string, unknown> }> = [];

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.queries.push({ text, values: values ?? [] });
      return store.results.shift() ?? [];
    }),
  })),
}));

vi.mock('../observability/audit.js', () => ({
  auditService: {
    record: vi.fn(async (entry: { action: string }) => {
      auditCalls.push({ action: entry.action });
    }),
  },
}));

vi.mock('../queue/producer.js', () => ({
  queueProducer: {
    enqueue: vi.fn(async (jobType: string, payload: Record<string, unknown>) => {
      enqueued.push({ jobType, payload });
      return true;
    }),
  },
}));

import { MailService } from './service.js';

beforeEach(() => {
  store.queries = [];
  store.results = [];
  auditCalls.length = 0;
  enqueued.length = 0;
  delete process.env['MAIL_RATE_PER_MINUTE'];
});

const send = (overrides: Record<string, unknown> = {}) => ({
  tenantId: 't-1',
  pluginName: 'my-plugin',
  to: 'user@example.com',
  subject: 'Hello',
  text: 'Hi there',
  ...overrides,
});

describe('MailService.enqueue (Item 12)', () => {
  it('persists a QUEUED outbox row, audits and enqueues mail.deliver', async () => {
    const service = new MailService();

    const sent = await service.enqueue(send());

    expect(sent).toBe(true);
    const insert = store.queries.find((query) => query.text.includes('INSERT INTO mails'));
    expect(insert).toBeDefined();
    expect(insert?.text).toContain("'QUEUED'");
    expect(insert?.values[0]).toBeDefined();
    expect(insert?.values[3]).toBe('user@example.com');
    expect(auditCalls.map((entry) => entry.action)).toEqual(['plugin.mail.send']);
    expect(enqueued).toEqual([{ jobType: 'mail.deliver', payload: { mailId: insert?.values[0] } }]);
  });

  it('validates recipient, subject and body', async () => {
    const service = new MailService();
    await expect(service.enqueue(send({ to: 'nope' }))).rejects.toThrow(/recipient/);
    await expect(service.enqueue(send({ subject: '' }))).rejects.toThrow(/subject/);
    await expect(service.enqueue(send({ text: undefined, html: undefined }))).rejects.toThrow(/html or text/);
    expect(store.queries.some((query) => query.text.includes('INSERT INTO mails'))).toBe(false);
  });

  it('rate limits per plugin+tenant with an audit entry (default 60/min)', async () => {
    process.env['MAIL_RATE_PER_MINUTE'] = '2';
    const service = new MailService();
    store.results = [[], [], [], [], []];

    expect(await service.enqueue(send())).toBe(true);
    expect(await service.enqueue(send({ to: 'second@example.com' }))).toBe(true);
    expect(await service.enqueue(send({ to: 'third@example.com' }))).toBe(false);

    expect(auditCalls).toContainEqual({ action: 'plugin.mail.rate_limited' });
    const inserts = store.queries.filter((query) => query.text.includes('INSERT INTO mails'));
    expect(inserts).toHaveLength(2);
  });
});

describe('MailService.deliver (Item 12)', () => {
  it('marks SENT through the log transport', async () => {
    const service = new MailService();
    store.results = [
      [{ id: 'm-1', to_email: 'user@example.com', subject: 'Hello', html: '<p>x</p>', text: null, status: 'QUEUED' }],
      [],
    ];

    const delivered = await service.deliver('m-1');

    expect(delivered).toBe(true);
    const update = store.queries.find((query) => query.text.includes("status = 'SENT'"));
    expect(update).toBeDefined();
  });

  it('marks FAILED with the error message on transport failure', async () => {
    process.env['MAIL_TRANSPORT'] = 'carrier-pigeon';
    const service = new MailService();
    store.results = [
      [{ id: 'm-1', to_email: 'user@example.com', subject: 'Hello', html: '<p>x</p>', text: null, status: 'QUEUED' }],
      [],
    ];

    const delivered = await service.deliver('m-1');

    expect(delivered).toBe(false);
    const update = store.queries.find((query) => query.text.includes("status = 'FAILED'"));
    expect(update?.values[1]).toContain('Unknown MAIL_TRANSPORT');
    delete process.env['MAIL_TRANSPORT'];
  });

  it('skips rows that are not QUEUED', async () => {
    const service = new MailService();
    store.results = [[{ id: 'm-1', status: 'SENT' }]];
    await expect(service.deliver('m-1')).resolves.toBe(false);
  });
});
