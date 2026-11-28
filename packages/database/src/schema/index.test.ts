import { describe, expect, it } from 'vitest';
import { getSchema } from './index.js';

describe('provider schema baselines', () => {
  it('includes the current settings and content contracts for postgres', () => {
    const schema = getSchema();
    const settingsTable = schema.match(/CREATE TABLE IF NOT EXISTS settings \(([\s\S]*?)\);/i)?.[1] ?? '';

    expect(settingsTable).toContain('visibility');
    expect(settingsTable).toMatch(/visibility\s+VARCHAR\(20\)\s+NOT NULL\s+DEFAULT\s+['`]internal['`]/i);
    expect(schema).toContain('published_at_gmt');
  });
});
