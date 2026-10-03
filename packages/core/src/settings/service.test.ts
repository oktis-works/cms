// @oktis-works/core - SettingsService: params jsonb crus + boolean via CASE WHEN
//
// Regressão do bug achado no E2E: o código pré-stringificava E o driver também
// serializava → gravava jsonb duplo ('"Site E2E"' em vez de 'Site E2E').
// E boolean nativo não tem cast para jsonb (boolean::jsonb não existe) — nesse
// caso o valor vira literal jsonb via CASE WHEN.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: {
  queries: { text: string; values: unknown[] }[];
  byKey: Record<string, unknown>[];
  returning: Record<string, unknown>[];
} = { queries: [], byKey: [], returning: [] };

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.queries.push({ text, values: values ?? [] });
      if (text.includes('FROM settings WHERE key')) return store.byKey;
      return store.returning;
    }),
  })),
}));

import { SettingsService } from './service.js';

beforeEach(() => {
  store.queries = [];
  store.byKey = [];
  store.returning = [{ id: 's-1', key: 'siteTitle' }];
});

describe('SettingsService.set (INSERT)', () => {
  it('passa a string CRUA como param — sem pre-stringify (uma serialização só)', async () => {
    await new SettingsService().set('siteTitle', 'Site E2E', 'general', 'string');

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(insert).toBeDefined();
    expect(insert!.text).toContain('$3::jsonb');
    expect(typeof insert!.values[0]).toBe('string'); // id (uuid)
    expect(insert!.values[1]).toBe('siteTitle');
    expect(insert!.values[2]).toBe('Site E2E'); // cru — NÃO '"Site E2E"'
    expect(insert!.values[3]).toBe('general');
    expect(insert!.values[4]).toBe('string');
  });

  it('boolean vira literal jsonb via CASE WHEN (param segue boolean)', async () => {
    await new SettingsService().set('maintenance', false, 'general', 'boolean');

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(insert!.text).toContain("CASE WHEN $3 THEN 'true'::jsonb ELSE 'false'::jsonb END");
    expect(insert!.values[2]).toBe(false);
  });

  it('objeto/array passam crus (driver serializa para jsonb)', async () => {
    await new SettingsService().set('menuLinks', [{ label: 'Home', url: '/' }], 'general', 'array');

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(insert!.values[2]).toEqual([{ label: 'Home', url: '/' }]);
  });
});

describe('SettingsService.set (UPDATE)', () => {
  it('atualiza com param cru em value = $1::jsonb', async () => {
    store.byKey = [{ key: 'siteTitle', value: 'Antigo' }];

    await new SettingsService().set('siteTitle', 'Novo Título', 'general', 'string');

    const update = store.queries.find((q) => q.text.includes('UPDATE settings'));
    expect(update!.text).toContain('value = $1::jsonb');
    expect(update!.values[0]).toBe('Novo Título');
  });

  it('boolean no UPDATE usa CASE WHEN $1 e param boolean', async () => {
    store.byKey = [{ key: 'maintenance', value: true }];

    await new SettingsService().set('maintenance', false, 'general', 'boolean');

    const update = store.queries.find((q) => q.text.includes('UPDATE settings'));
    expect(update!.text).toContain("CASE WHEN $1 THEN 'true'::jsonb ELSE 'false'::jsonb END");
    expect(update!.values[0]).toBe(false);
  });
});
