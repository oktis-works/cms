-- +migrate Up
-- Allow configuration history for both global and tenant-scoped themes.
DROP POLICY IF EXISTS tenant_isolation_theme_config_versions ON theme_config_versions;
CREATE POLICY tenant_isolation_theme_config_versions ON theme_config_versions
  USING (
    theme_id IN (
      SELECT id
      FROM themes
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR tenant_id IS NULL
    )
  )
  WITH CHECK (
    theme_id IN (
      SELECT id
      FROM themes
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
         OR tenant_id IS NULL
    )
  );

ALTER TABLE theme_config_versions FORCE ROW LEVEL SECURITY;

-- +migrate Down
DROP POLICY IF EXISTS tenant_isolation_theme_config_versions ON theme_config_versions;
CREATE POLICY tenant_isolation_theme_config_versions ON theme_config_versions USING (
  theme_id IN (
    SELECT id FROM themes WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  )
);
