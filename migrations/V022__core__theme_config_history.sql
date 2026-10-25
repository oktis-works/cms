-- @okcms domain=core_schema provider=postgres
-- +migrate Up
-- Theme config version history (audit trail + restore capability)
CREATE TABLE IF NOT EXISTS theme_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_theme_config_versions_theme ON theme_config_versions(theme_id);
CREATE INDEX IF NOT EXISTS idx_theme_config_versions_created ON theme_config_versions(created_at DESC);

-- Enable RLS
ALTER TABLE theme_config_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_theme_config_versions' AND tablename = 'theme_config_versions'
  ) THEN
    CREATE POLICY tenant_isolation_theme_config_versions ON theme_config_versions USING (
      theme_id IN (
        SELECT id FROM themes WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
      )
    );
  END IF;
END $$;

-- +migrate Down
DROP TABLE IF EXISTS theme_config_versions;
