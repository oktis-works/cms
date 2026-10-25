import { describe, expect, it } from 'vitest';
import { translateProviderSql } from './connection.js';

describe('provider SQL adapter', () => {
  it('translates PostgreSQL placeholders, JSON, UUID, conflict, and session syntax for MySQL', () => {
    const sql = translateProviderSql(
      "INSERT INTO content (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data RETURNING *",
      'mysql'
    );
    expect(sql).not.toContain('::jsonb');
    expect(translateProviderSql('SELECT JSONB FROM content', 'mysql')).toContain('JSON');
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
    expect(sql).toContain('VALUES(data)');
    expect(sql).not.toContain('RETURNING');
    expect(translateProviderSql('SELECT gen_random_uuid(), version::integer FROM t', 'mysql')).toContain('UUID()');
    expect(translateProviderSql('SELECT gen_random_uuid(), version::integer FROM t', 'mysql')).toContain('version');
    expect(translateProviderSql('CREATE TABLE t (id UUID DEFAULT UUID())', 'mysql')).toContain('DEFAULT (UUID())');
    expect(translateProviderSql("ALTER TABLE t ADD COLUMN dependencies JSON NOT NULL DEFAULT '[]'", 'mysql')).toContain("DEFAULT ('[]')");
  });

  it('removes PostgreSQL-only RLS and procedural blocks for MariaDB snapshots', () => {
    const sql = translateProviderSql('ALTER TABLE content ENABLE ROW LEVEL SECURITY; DO $$ BEGIN NULL; END $$;', 'mariadb');
    expect(sql).not.toMatch(/ROW LEVEL SECURITY|DO \$\$/i);
  });
});
