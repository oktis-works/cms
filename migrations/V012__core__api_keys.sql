-- +migrate Up
-- API Keys para clientes API-first (content API).
--
-- Segurança do design: a API key NUNCA autoriza requests diretamente. Ela é
-- usada UMA vez em POST /api/v1/auth/api-key-login para obter access JWT +
-- refresh token; a partir daí o cliente opera com Bearer + /auth/refresh
-- (com rotação e reuse-detection herdados de sessions). Guardamos apenas o
-- hash sha256 da key; o valor claro existe só na criação.

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Identidade que o login via API key assume (papéis vêm do vínculo em tenant_users).
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  -- Trecho em claro usado para localizar a row (não é segredo).
  key_prefix VARCHAR(32) NOT NULL,
  -- sha256 do valor completo — nunca o valor claro.
  key_hash VARCHAR(128) NOT NULL,
  -- Revoga a key após o primeiro uso no endpoint de login.
  one_time BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(tenant_id, key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tenant_isolation_api_keys' AND tablename = 'api_keys'
  ) THEN
    CREATE POLICY tenant_isolation_api_keys ON api_keys
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

-- +migrate Down
DROP TABLE IF EXISTS api_keys;
