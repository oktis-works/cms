-- @okcms domain=core_schema provider=mariadb
-- +migrate Up
-- Vínculo plugin <-> tenant (decisão: plugins são por-tenant de verdade).
--
-- Antes a ativação era `plugins.status = 'ACTIVATED'` com `tenant_id` no row,
-- mas o bootstrap só carregava `tenant_id IS NULL` → o plugin "ativado" nunca
-- executava register(). Este delta separa as duas semânticas:
--
--   plugins        = artefato instalado (sempre tenant_id NULL, status de instalação)
--   plugin_tenants = quem tem o plugin ligado (ENABLED/DISABLED, por tenant)
--
-- O bootstrap por tenant lê plugin_tenants; o platform lê plugins sem vínculo.

CREATE TABLE IF NOT EXISTS plugin_tenants (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  plugin_id CHAR(36) NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ENABLED' CHECK (status IN ('ENABLED', 'DISABLED')),
  error TEXT,
  enabled_at TIMESTAMP,
  disabled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (plugin_id, tenant_id)
);

CREATE INDEX idx_plugin_tenants_tenant ON plugin_tenants(tenant_id, status);
CREATE INDEX idx_plugin_tenants_plugin ON plugin_tenants(plugin_id);

-- Backfill 1: rows por-tenant antigos (ACTIVATED) viram vínculo ENABLED e o
-- artefato passa a ser platform (tenant_id NULL).
INSERT INTO plugin_tenants (plugin_id, tenant_id, status, enabled_at, created_at, updated_at)
SELECT p.id, p.tenant_id, 'ENABLED', COALESCE(p.activated_at, NOW()), NOW(), NOW()
FROM plugins p
WHERE p.tenant_id IS NOT NULL
  AND p.status = 'ACTIVATED'
;

-- Backfill 2: artefato platform ACTIVATED continuava valendo para todos —
-- materializa o vínculo ENABLED para cada tenant existente.
INSERT INTO plugin_tenants (plugin_id, tenant_id, status, enabled_at, created_at, updated_at)
SELECT p.id, t.id, 'ENABLED', COALESCE(p.activated_at, NOW()), NOW(), NOW()
FROM plugins p
CROSS JOIN tenants t
WHERE p.tenant_id IS NULL
  AND p.status = 'ACTIVATED'
;

-- Artefato nunca mais carrega dono: o dono é o vínculo.
UPDATE plugins SET tenant_id = NULL WHERE tenant_id IS NOT NULL;

-- Novos estados de instalação: sumiu do disco (MISSING) e falhou ao carregar
-- (LOAD_FAILED — visível no admin, tentado de novo na próxima sync).
ALTER TABLE plugins DROP CONSTRAINT IF EXISTS plugins_status_check;
ALTER TABLE plugins ADD CONSTRAINT plugins_status_check CHECK (status IN (
  'DISCOVERED', 'VALIDATED', 'INSTALLED', 'MIGRATED', 'ACTIVATED', 'RUNNING',
  'DEACTIVATED', 'UNINSTALLED', 'INSTALL_FAILED', 'MIGRATION_FAILED',
  'ACTIVATION_FAILED', 'INCOMPATIBLE', 'QUARANTINED',
  'MISSING', 'LOAD_FAILED'
));

-- Com o dono virando vínculo, o RLS de plugins/themes precisa valer também
-- para o papel dono das tabelas (o app conecta como owner).
-- +migrate Down
ALTER TABLE plugins DROP CONSTRAINT IF EXISTS plugins_status_check;
ALTER TABLE plugins ADD CONSTRAINT plugins_status_check CHECK (status IN (
  'DISCOVERED', 'VALIDATED', 'INSTALLED', 'MIGRATED', 'ACTIVATED', 'RUNNING',
  'DEACTIVATED', 'UNINSTALLED', 'INSTALL_FAILED', 'MIGRATION_FAILED',
  'ACTIVATION_FAILED', 'INCOMPATIBLE', 'QUARANTINED'
));

-- O vínculo é a fonte de verdade da ativação desde este delta; reverter não
-- restaura `plugins.tenant_id` (os artefatos platform continuam platform —
-- atribuir dono a partir de um vínculo faria plugin global virar por-tenant).
DROP TABLE IF EXISTS plugin_tenants;
