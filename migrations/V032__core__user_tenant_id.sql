-- @okcms domain=core_schema provider=postgres
-- Adiciona tenant_id à tabela users para isolamento por tenant no login.
-- O e-mail já é UNIQUE globalmente (bloqueia duplicidade entre tenants).
-- Usuários existentes recebem tenant_id do tenant 'default' via backfill.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Backfill: usuários existentes apontam para o tenant 'default'
UPDATE users
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' AND status = 'ACTIVE' LIMIT 1)
WHERE tenant_id IS NULL;

-- Índice composto para lookup rápido por email + tenant no login
CREATE INDEX IF NOT EXISTS idx_users_email_tenant ON users(email, tenant_id);
