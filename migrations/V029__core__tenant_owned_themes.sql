-- @okcms domain=core_schema provider=postgres
-- +migrate Up
-- Themes are tenant-owned. Existing global rows are assigned to the default
-- tenant before the column becomes NOT NULL.
INSERT INTO tenants (name, slug)
VALUES ('Default', 'default')
ON CONFLICT (slug) DO NOTHING;

UPDATE themes
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM themes WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot make themes.tenant_id NOT NULL: unresolved theme rows remain';
  END IF;
END $$;

ALTER TABLE themes ALTER COLUMN tenant_id SET NOT NULL;
DROP INDEX IF EXISTS idx_themes_name_unique;
CREATE UNIQUE INDEX idx_themes_name_unique ON themes(tenant_id, name);
DROP INDEX IF EXISTS idx_themes_single_active;
CREATE UNIQUE INDEX idx_themes_single_active ON themes(tenant_id) WHERE status = 'ACTIVE';

DROP POLICY IF EXISTS tenant_isolation_themes ON themes;
CREATE POLICY tenant_isolation_themes ON themes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_theme_config_versions ON theme_config_versions;
CREATE POLICY tenant_isolation_theme_config_versions ON theme_config_versions
  USING (theme_id IN (SELECT id FROM themes WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid))
  WITH CHECK (theme_id IN (SELECT id FROM themes WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid));

-- +migrate Down
DROP POLICY IF EXISTS tenant_isolation_theme_config_versions ON theme_config_versions;
DROP POLICY IF EXISTS tenant_isolation_themes ON themes;
DROP INDEX IF EXISTS idx_themes_single_active;
DROP INDEX IF EXISTS idx_themes_name_unique;
CREATE UNIQUE INDEX idx_themes_name_unique ON themes(name);
CREATE UNIQUE INDEX idx_themes_single_active
  ON themes((COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  WHERE status = 'ACTIVE';
ALTER TABLE themes ALTER COLUMN tenant_id DROP NOT NULL;
