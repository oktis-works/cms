// @oktis-works/web - Resolução de tenant a partir do Host
// localhost:PORTA precisa cair no tenant default (dev zero-config) e
// host:PORTA precisa casar com domain exato (produção atrás de porta).

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
let queue: Row[][];
const calls: { text: string; values?: unknown[] }[] = [];

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      calls.push({ text, values });
      return queue.shift() ?? [];
    }),
  })),
}));

import { resolveTenantFromHost } from './tenant-resolver.js';

const defaultTenant: Row = { id: 'eeb2ded0-14bb-4eb8-8505-f2a678943ebb', slug: 'default', status: 'ACTIVE' };

beforeEach(() => {
  queue = [];
  calls.length = 0;
});

describe('resolveTenantFromHost — loopback (dev zero-config)', () => {
  it('localhost:PORTA usa o tenant default (porta é normalizada)', async () => {
    queue = [[defaultTenant]];

    const tenant = await resolveTenantFromHost('localhost:3002');

    expect(tenant?.['slug']).toBe('default');
    expect(calls[0]?.values).toEqual(['default', 'ACTIVE']);
    expect(calls[0]?.text).toContain('WHERE slug =');
  });

  it('localhost sem porta também usa o default', async () => {
    queue = [[defaultTenant]];

    expect(await resolveTenantFromHost('localhost')).not.toBeNull();
  });

  it('127.0.0.1 é loopback (não tenta subdomain "127")', async () => {
    queue = [[defaultTenant]];

    await resolveTenantFromHost('127.0.0.1:3002');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('WHERE slug =');
  });

  it('sem default: cai no domain exato configurado (localhost)', async () => {
    queue = [[], [{ ...defaultTenant, domain: 'localhost' }]];

    const tenant = await resolveTenantFromHost('localhost:3002');

    expect(tenant?.['domain']).toBe('localhost');
    expect(calls[1]?.values).toEqual(['localhost', 'ACTIVE']);
  });

  it('loopback sem nenhum tenant compatível retorna null (404)', async () => {
    queue = [[], []];

    expect(await resolveTenantFromHost('localhost:3002')).toBeNull();
  });
});

describe('resolveTenantFromHost — produção (domain/subdomain)', () => {
  it('host com porta casa com domain exato sem a porta', async () => {
    const row: Row = { id: 't1', domain: 'exemplo.com', status: 'ACTIVE' };
    queue = [[], [row]];

    const tenant = await resolveTenantFromHost('exemplo.com:8080');

    expect(tenant?.['domain']).toBe('exemplo.com');
    // subdomain lookup veio primeiro ('exemplo') e não casou; domain recebe host limpo
    expect(calls[1]?.values).toEqual(['exemplo.com', 'ACTIVE']);
  });

  it('subdomain resolve antes do domain', async () => {
    const row: Row = { id: 't2', subdomain: 'loja', status: 'ACTIVE' };
    queue = [[row]];

    const tenant = await resolveTenantFromHost('loja.exemplo.com');

    expect(tenant?.['subdomain']).toBe('loja');
    expect(calls[0]?.text).toContain('WHERE subdomain =');
    expect(calls[0]?.values).toEqual(['loja', 'ACTIVE']);
    expect(calls).toHaveLength(1);
  });

  it('www e api não são subdomain (vão direto pro domain)', async () => {
    queue = [[{ id: 't3', domain: 'www.exemplo.com' }], [{ id: 't4', domain: 'api.exemplo.com' }]];

    const www = await resolveTenantFromHost('www.exemplo.com');
    expect(www?.['domain']).toBe('www.exemplo.com');
    expect(calls[0]?.text).toContain('WHERE domain =');
    expect(calls[0]?.values).toEqual(['www.exemplo.com', 'ACTIVE']);

    const api = await resolveTenantFromHost('api.exemplo.com');
    expect(api?.['domain']).toBe('api.exemplo.com');
    expect(calls[1]?.text).toContain('WHERE domain =');
    expect(calls[1]?.values).toEqual(['api.exemplo.com', 'ACTIVE']);
    expect(calls).toHaveLength(2); // nenhuma query de subdomain para www/api
  });

  it('host sem ponto não tenta subdomain', async () => {
    queue = [[], []];

    await resolveTenantFromHost('intranet');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('WHERE domain =');
    expect(calls[0]?.values).toEqual(['intranet', 'ACTIVE']);
  });

  it('nenhum match retorna null (404 Tenant not found)', async () => {
    queue = [[], []];

    expect(await resolveTenantFromHost('desconhecido.com')).toBeNull();
  });
});
