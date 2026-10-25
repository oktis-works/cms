-- @okcms domain=core_schema provider=mariadb
-- +migrate Up
-- API Keys para clientes API-first (content API).
--
-- Segurança do design: a API `key` NUNCA autoriza requests diretamente. Ela é
-- usada UMA vez em POST /api/v1/auth/api-`key`-login para obter access JWT +
-- refresh token; a partir daí o cliente opera com Bearer + /auth/refresh
-- (com rotação e reuse-detection herdados de sessions). Guardamos apenas o
-- hash sha256 da `key`; o valor claro existe só na criação.

CREATE TABLE IF NOT EXISTS api_keys (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Identidade que o login via API `key` assume (papéis vêm do vínculo em tenant_users).
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  -- Trecho em claro usado para localizar a row (não é segredo).
  key_prefix VARCHAR(32) NOT NULL,
  -- sha256 do valor completo — nunca o valor claro.
  key_hash VARCHAR(128) NOT NULL,
  -- Revoga a `key` após o primeiro uso no endpoint de login.
  one_time BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMP,
  created_by CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_api_keys_prefix ON api_keys(tenant_id, key_prefix);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- +migrate Down
DROP TABLE IF EXISTS api_keys;
