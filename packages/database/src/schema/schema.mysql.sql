-- Generated from schema.sql for mysql. Do not edit by hand.
-- OkCMS v2 - Database Schema
-- Generated from SDD specification

-- ============================================================
-- Tenants
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  domain VARCHAR(255),
  subdomain VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  settings JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_subdomain ON tenants(subdomain);

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(511) NOT NULL,
  avatar VARCHAR(511),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED')),
  locale VARCHAR(10),
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Idempotente para bancos criados antes do i18n do admin (V005).
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- ============================================================
-- Roles
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  permissions JSON NOT NULL DEFAULT ('[]'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_roles_slug ON roles(slug);

-- ============================================================
-- Tenant Users (many-to-many with role)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id CHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);

-- ============================================================
-- Permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  scope VARCHAR(255) NOT NULL
);

CREATE INDEX idx_permissions_slug ON permissions(slug);

-- ============================================================
-- Content
-- ============================================================
CREATE TABLE IF NOT EXISTS content (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  body JSON,
  excerpt TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED')),
  author_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  featured_image_id CHAR(36),
  seo_title VARCHAR(500),
  seo_description TEXT,
  metadata JSON,
  published_at TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_content_tenant ON content(tenant_id);
CREATE INDEX idx_content_type ON content(type);
CREATE INDEX idx_content_status ON content(status);
CREATE INDEX idx_content_slug ON content(tenant_id, type, slug);
CREATE INDEX idx_content_author ON content(author_id);
CREATE INDEX idx_content_published ON content(published_at);
ALTER TABLE content ADD COLUMN data JSON NOT NULL DEFAULT ('{}');
ALTER TABLE content ADD COLUMN layout VARCHAR(255);
ALTER TABLE content ADD COLUMN parent_id CHAR(36) REFERENCES content(id) ON DELETE SET NULL;

CREATE INDEX idx_content_parent ON content(parent_id);
CREATE INDEX idx_content_tenant_type_parent ON content(tenant_id, type, parent_id);

-- ============================================================
-- URL Redirects
-- ============================================================
CREATE TABLE IF NOT EXISTS url_redirects (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_path VARCHAR(2048) NOT NULL,
  target_path VARCHAR(2048) NOT NULL,
  redirect_type SMALLINT NOT NULL DEFAULT 301,
  is_prefix BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT
);

CREATE INDEX idx_url_redirects_tenant_source ON url_redirects(tenant_id, source_path(255));
CREATE INDEX idx_url_redirects_tenant_prefix ON url_redirects(tenant_id);

-- ============================================================
-- Content Versions
-- ============================================================
CREATE TABLE IF NOT EXISTS content_versions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  content_id CHAR(36) NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  body JSON,
  excerpt TEXT,
  featured_image_id CHAR(36),
  seo_title VARCHAR(500),
  seo_description TEXT,
  metadata JSON,
  author_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE content_versions ADD COLUMN slug VARCHAR(500);
CREATE INDEX idx_content_versions_content ON content_versions(content_id);
CREATE INDEX idx_content_versions_version ON content_versions(content_id, version DESC);

-- ============================================================
-- Media
-- ============================================================
CREATE TABLE IF NOT EXISTS media (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  title VARCHAR(500),
  mime_type VARCHAR(255) NOT NULL,
  size INTEGER NOT NULL,
  path VARCHAR(1000) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  alt VARCHAR(500),
  caption TEXT,
  description TEXT,
  metadata JSON,
  uploaded_by CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Idempotent upgrade path for databases created before attachment titles and
-- descriptions were added (CREATE TABLE IF NOT EXISTS does not alter them).
UPDATE media SET title = filename WHERE title IS NULL;

CREATE INDEX idx_media_tenant ON media(tenant_id);
CREATE INDEX idx_media_mime ON media(mime_type);
CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);

-- ============================================================
-- Categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id CHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_tenant ON categories(tenant_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- ============================================================
-- Tags
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tags_tenant ON tags(tenant_id);

-- ============================================================
-- Content Tags (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS content_tags (
  content_id CHAR(36) NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  tag_id CHAR(36) NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, tag_id)
);

CREATE INDEX idx_content_tags_content ON content_tags(content_id);
CREATE INDEX idx_content_tags_tag ON content_tags(tag_id);

-- ============================================================
-- Content Categories (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS content_categories (
  content_id CHAR(36) NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  category_id CHAR(36) NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, category_id)
);

CREATE INDEX idx_content_categories_content ON content_categories(content_id);
CREATE INDEX idx_content_categories_category ON content_categories(category_id);

-- ============================================================
-- Menus
-- ============================================================
CREATE TABLE IF NOT EXISTS menus (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  items JSON NOT NULL DEFAULT ('[]'),
  settings JSON NOT NULL DEFAULT ('{}'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_menus_tenant ON menus(tenant_id);

-- ============================================================
-- Settings
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  `key` VARCHAR(255) NOT NULL,
  value JSON NOT NULL,
  `group` VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(`key`, tenant_id)
);

CREATE INDEX idx_settings_tenant ON settings(tenant_id);
CREATE INDEX idx_settings_group ON settings(`group`);

-- ============================================================
-- Plugins
-- ============================================================
CREATE TABLE IF NOT EXISTS plugins (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN (
    'DISCOVERED', 'VALIDATED', 'INSTALLED', 'MIGRATED', 'ACTIVATED', 'RUNNING',
    'DEACTIVATED', 'UNINSTALLED', 'INSTALL_FAILED', 'MIGRATION_FAILED',
    'ACTIVATION_FAILED', 'INCOMPATIBLE', 'QUARANTINED',
    'MISSING', 'LOAD_FAILED'
  )),
  manifest JSON NOT NULL,
  permissions JSON NOT NULL DEFAULT ('[]'),
  config JSON,
  installed_at TIMESTAMP,
  activated_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plugins_tenant ON plugins(tenant_id);
CREATE INDEX idx_plugins_name ON plugins(name);
CREATE INDEX idx_plugins_status ON plugins(status);

-- ============================================================
-- Plugin <-> Tenant (ativação por tenant)
-- ============================================================
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

-- ============================================================
-- Plugin Dependencies
-- ============================================================
CREATE TABLE IF NOT EXISTS plugin_dependencies (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  plugin_id CHAR(36) NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  dependency_id CHAR(36) NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  version_range VARCHAR(100) NOT NULL,
  optional BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_plugin_dependencies_plugin ON plugin_dependencies(plugin_id);

-- ============================================================
-- Themes
-- ============================================================
-- Temas são GLOBAIS no modelo atual: tenant_id fica NULL (reservado para
-- multi-tenant futuro) e a policy RLS permite tenant_id IS NULL.
CREATE TABLE IF NOT EXISTS themes (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'INSTALLED' CHECK (status IN ('ACTIVE', 'INACTIVE', 'INSTALLED')),
  manifest JSON NOT NULL,
  config JSON,
  installed_at TIMESTAMP,
  activated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_themes_tenant ON themes(tenant_id);
-- Nome único globalmente: a descoberta por diretório faz upsert por name.
CREATE UNIQUE INDEX idx_themes_name_unique ON themes(name);
CREATE INDEX idx_themes_status ON themes(status);
-- No máximo UM tema ativo por tenant (NULL = global).
ALTER TABLE themes ADD COLUMN active_scope CHAR(36);
CREATE UNIQUE INDEX idx_themes_single_active ON themes(active_scope);
CREATE TRIGGER themes_active_scope_insert BEFORE INSERT ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', IFNULL(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'), NULL);
CREATE TRIGGER themes_active_scope_update BEFORE UPDATE ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', IFNULL(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'), NULL);

CREATE TABLE IF NOT EXISTS theme_config_versions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  theme_id CHAR(36) NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  config JSON NOT NULL,
  user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  change_summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_theme_config_versions_theme ON theme_config_versions(theme_id);
CREATE INDEX idx_theme_config_versions_created ON theme_config_versions(created_at DESC);

-- ============================================================
-- Builds
-- ============================================================
CREATE TABLE IF NOT EXISTS builds (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  core_version VARCHAR(50) NOT NULL,
  plugins JSON NOT NULL DEFAULT ('{}'),
  theme JSON NOT NULL DEFAULT ('{}'),
  docker_image VARCHAR(500),
  checksum VARCHAR(255),
  build_log TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_builds_tenant ON builds(tenant_id);
CREATE INDEX idx_builds_status ON builds(status);

-- ============================================================
-- Deployments
-- ============================================================
CREATE TABLE IF NOT EXISTS deployments (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  build_id CHAR(36) NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'QUEUED', 'BUILDING', 'TESTING', 'PACKAGING', 'PUSHING',
    'DEPLOYING', 'HEALTH_CHECK', 'ACTIVE', 'FAILED', 'CANCELLED', 'ROLLED_BACK'
  )),
  core_version VARCHAR(50) NOT NULL,
  theme_version VARCHAR(50),
  plugin_versions JSON NOT NULL DEFAULT ('{}'),
  docker_image VARCHAR(500),
  checksum VARCHAR(255) NOT NULL,
  rollback_to_id CHAR(36) REFERENCES deployments(id) ON DELETE SET NULL,
  health_check_status VARCHAR(20) CHECK (health_check_status IN ('PASSING', 'FAILING', 'PENDING')),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  created_by CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deployments_tenant ON deployments(tenant_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_build ON deployments(build_id);

-- ============================================================
-- Events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  type VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id CHAR(36) NOT NULL,
  payload JSON NOT NULL,
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RULE-event-idempotency: eventos que esgotam retries vão para DLQ durável
CREATE TABLE IF NOT EXISTS dead_letter_events (
  id CHAR(36) PRIMARY KEY,
  type VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id CHAR(36) NOT NULL,
  payload JSON NOT NULL,
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dle_type ON dead_letter_events(type);
CREATE INDEX idx_dle_created ON dead_letter_events(created_at DESC);

CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_tenant ON events(tenant_id);
CREATE INDEX idx_events_aggregate ON events(aggregate_type, aggregate_id);
CREATE INDEX idx_events_processed ON events(processed);
CREATE INDEX idx_events_created ON events(created_at DESC);

-- ============================================================
-- Audit Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(255) NOT NULL,
  resource_id CHAR(36),
  changes JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================================
-- Migrations
-- ============================================================
CREATE TABLE IF NOT EXISTS migrations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner VARCHAR(255) NOT NULL,
  owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('CORE', 'PLUGIN')),
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(255) NOT NULL,
  UNIQUE(tenant_id, owner, version)
);

-- Migration metadata is additive so old installations can adopt the current
-- ledger without losing their applied history.
ALTER TABLE migrations ADD COLUMN domain VARCHAR(30) NOT NULL DEFAULT 'tenant_data';
ALTER TABLE migrations ADD COLUMN provider VARCHAR(20) NOT NULL DEFAULT 'mysql';
ALTER TABLE migrations ADD COLUMN reversible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE migrations ADD COLUMN forward_only BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE migrations ADD COLUMN destructive BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE migrations ADD COLUMN requires_backup BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE migrations ADD COLUMN dependencies JSON NOT NULL DEFAULT ('[]');

CREATE INDEX idx_migrations_tenant ON migrations(tenant_id);

-- Domain ledgers. The legacy `migrations` table remains readable during the
-- one-time adoption window; new executions are recorded in exactly one domain
-- ledger according to migration metadata.
CREATE TABLE IF NOT EXISTS core_schema_migrations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  owner VARCHAR(255) NOT NULL,
  owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('CORE', 'PLUGIN')),
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(255) NOT NULL,
  domain VARCHAR(30) NOT NULL DEFAULT 'core_schema',
  provider VARCHAR(20) NOT NULL DEFAULT 'mysql',
  reversible BOOLEAN NOT NULL DEFAULT FALSE,
  forward_only BOOLEAN NOT NULL DEFAULT TRUE,
  destructive BOOLEAN NOT NULL DEFAULT FALSE,
  requires_backup BOOLEAN NOT NULL DEFAULT FALSE,
  dependencies JSON NOT NULL DEFAULT ('[]'),
  UNIQUE(owner, version)
);

CREATE TABLE IF NOT EXISTS tenant_data_migrations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner VARCHAR(255) NOT NULL,
  owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('CORE', 'PLUGIN')),
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(255) NOT NULL,
  domain VARCHAR(30) NOT NULL DEFAULT 'tenant_data',
  provider VARCHAR(20) NOT NULL DEFAULT 'mysql',
  reversible BOOLEAN NOT NULL DEFAULT FALSE,
  forward_only BOOLEAN NOT NULL DEFAULT TRUE,
  destructive BOOLEAN NOT NULL DEFAULT FALSE,
  requires_backup BOOLEAN NOT NULL DEFAULT FALSE,
  dependencies JSON NOT NULL DEFAULT ('[]'),
  UNIQUE(tenant_id, owner, version)
);

CREATE TABLE IF NOT EXISTS plugin_schema_migrations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner VARCHAR(255) NOT NULL,
  owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('CORE', 'PLUGIN')),
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(255) NOT NULL,
  domain VARCHAR(30) NOT NULL DEFAULT 'plugin_schema',
  provider VARCHAR(20) NOT NULL DEFAULT 'mysql',
  reversible BOOLEAN NOT NULL DEFAULT FALSE,
  forward_only BOOLEAN NOT NULL DEFAULT TRUE,
  destructive BOOLEAN NOT NULL DEFAULT FALSE,
  requires_backup BOOLEAN NOT NULL DEFAULT FALSE,
  dependencies JSON NOT NULL DEFAULT ('[]'),
  UNIQUE(tenant_id, owner, version)
);

-- Records which `schema` snapshot has bootstrapped this database. This is an
-- audit anchor for fresh installs and one-time adoption of legacy databases.
CREATE TABLE IF NOT EXISTS schema_bootstrap (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  schema_version VARCHAR(50) NOT NULL,
  schema_checksum VARCHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Components
-- ============================================================
CREATE TABLE IF NOT EXISTS components (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('CORE', 'THEME', 'PLUGIN')),
  source_id CHAR(36),
  version VARCHAR(50) NOT NULL,
  `schema` JSON NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_components_name ON components(name);
CREATE INDEX idx_components_source ON components(source);

-- ============================================================
-- Content Types
-- ============================================================
CREATE TABLE IF NOT EXISTS content_types (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(20) NOT NULL CHECK (source IN ('CORE', 'PLUGIN', 'ADMIN')),
  source_id CHAR(36),
  `schema` JSON NOT NULL,
  plural_label VARCHAR(255) NOT NULL,
  singular_label VARCHAR(255) NOT NULL,
  default_fields JSON NOT NULL DEFAULT ('["title","slug","content","excerpt","featured_image","seo_title","seo_description","status","author"]'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_content_types_slug ON content_types(slug);

-- Add new columns to existing content_types table (idempotent)
-- ============================================================
-- Webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS webhooks (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url VARCHAR(1000) NOT NULL,
  events JSON NOT NULL DEFAULT ('[]'),
  secret VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Autenticação configurável para webhooks. Os campos antigos continuam sendo
-- mantidos para que instalações existentes migrem sem perder seus segredos.
ALTER TABLE webhooks ADD COLUMN auth_type VARCHAR(30) NOT NULL DEFAULT 'hmac_sha256';
ALTER TABLE webhooks ADD COLUMN auth_config JSON NOT NULL DEFAULT ('{}');

-- ============================================================
-- Webhook hardening (Item 19 — rotação de segredos + dead-letter)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_secrets (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  webhook_id CHAR(36) NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  secret VARCHAR(255) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rotated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(webhook_id, version)
);

CREATE INDEX idx_webhook_secrets_webhook ON webhook_secrets(webhook_id, is_active);

CREATE TABLE IF NOT EXISTS webhook_dead_letters (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  webhook_id CHAR(36) NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(191) NOT NULL,
  payload JSON NOT NULL,
  error TEXT,
  attempts INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_dead_letters_webhook ON webhook_dead_letters(webhook_id, created_at);
UPDATE webhooks
SET auth_config = JSON_OBJECT('secret', secret)
WHERE auth_type = 'hmac_sha256' AND auth_config = '{}' AND secret <> '';

CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_id);

-- ============================================================
-- Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sessions ADD COLUMN refresh_token_hash VARCHAR(128);
ALTER TABLE sessions ADD COLUMN refresh_family_id CHAR(36);
ALTER TABLE sessions ADD COLUMN revoked_at TIMESTAMP;
ALTER TABLE sessions ADD COLUMN replaced_by_session_id CHAR(36);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_refresh_hash ON sessions(refresh_token_hash);
CREATE INDEX idx_sessions_refresh_family ON sessions(refresh_family_id);

-- ============================================================
-- API Keys (login via API para clientes API-first)
-- A `key` NUNCA autoriza requests: troca por access JWT + refresh token em
-- POST /api/v1/auth/api-`key`-login. Guardamos só o hash sha256.
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  key_hash VARCHAR(128) NOT NULL,
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

-- ============================================================
-- Custom Taxonomies (SDD ENTI-025)
-- ============================================================
CREATE TABLE IF NOT EXISTS taxonomies (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  hierarchical BOOLEAN NOT NULL DEFAULT false,
  attach_to JSON NOT NULL DEFAULT ('[]'),
  labels JSON NOT NULL DEFAULT ('{}'),
  meta JSON NOT NULL DEFAULT ('{}'),
  source VARCHAR(20) NOT NULL DEFAULT 'ADMIN' CHECK (source IN ('CORE', 'PLUGIN', 'ADMIN')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_taxonomies_tenant ON taxonomies(tenant_id);
CREATE INDEX idx_taxonomies_slug ON taxonomies(slug);
-- ============================================================
-- Field Groups (SDD ENTI-026)
-- ============================================================
CREATE TABLE IF NOT EXISTS field_groups (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  location_rules JSON NOT NULL DEFAULT ('[]'),
  position VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (position IN ('normal', 'side', 'after_title')),
  display_style VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (display_style IN ('standard', 'seamless', 'grouped')),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSON NOT NULL DEFAULT ('{}'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_field_groups_tenant ON field_groups(tenant_id);
CREATE INDEX idx_field_groups_active ON field_groups(active);
CREATE UNIQUE INDEX field_groups_global_key_unique
  ON field_groups (`key`);
CREATE UNIQUE INDEX field_groups_tenant_key_unique
  ON field_groups (tenant_id, `key`);
-- ============================================================
-- Field Definitions (SDD ENTI-027)
-- ============================================================
CREATE TABLE IF NOT EXISTS field_definitions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  group_id CHAR(36) NOT NULL REFERENCES field_groups(id) ON DELETE CASCADE,
  parent_field_id CHAR(36) REFERENCES field_definitions(id) ON DELETE CASCADE,
  layout_id CHAR(36),
  type VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  `key` VARCHAR(255) NOT NULL UNIQUE,
  label VARCHAR(500) NOT NULL,
  instructions TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  config JSON NOT NULL DEFAULT ('{}'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_core_field BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  core_field_key VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns to existing field_definitions table (idempotent)
CREATE INDEX idx_field_definitions_group ON field_definitions(group_id);
CREATE INDEX idx_field_definitions_parent ON field_definitions(parent_field_id);
CREATE INDEX idx_field_definitions_core ON field_definitions(is_core_field);
CREATE INDEX idx_field_definitions_locked ON field_definitions(is_locked);
CREATE INDEX idx_field_definitions_core_key ON field_definitions(core_field_key);
-- ============================================================
-- Field Values (valores isolados por entidade)
-- ============================================================
CREATE TABLE IF NOT EXISTS field_values (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  field_definition_id CHAR(36) NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('content', 'taxonomy_term')),
  entity_id CHAR(36) NOT NULL,
  value JSON NOT NULL DEFAULT ('{}'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(field_definition_id, entity_type, entity_id)
);

CREATE INDEX idx_field_values_entity ON field_values(entity_type, entity_id);
CREATE INDEX idx_field_values_field ON field_values(field_definition_id);
CREATE INDEX idx_field_values_updated ON field_values(updated_at DESC);

CREATE TABLE IF NOT EXISTS content_value_migration_conflicts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  content_id CHAR(36) NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL,
  sources JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_id, field_name)
);

CREATE INDEX idx_content_value_migration_conflicts_content
  ON content_value_migration_conflicts(content_id);

DROP TRIGGER IF EXISTS trg_field_values_updated;
CREATE TRIGGER trg_field_values_updated BEFORE UPDATE ON field_values FOR EACH ROW SET NEW.updated_at = NOW();

-- ============================================================
-- Flexible Layouts (SDD ENTI-028)
-- ============================================================
CREATE TABLE IF NOT EXISTS flexible_layouts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  field_id CHAR(36) NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  label VARCHAR(500) NOT NULL,
  display VARCHAR(20) NOT NULL DEFAULT 'block' CHECK (display IN ('block', 'table', 'row')),
  min INTEGER,
  max INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(field_id, name)
);

CREATE INDEX idx_flexible_layouts_field ON flexible_layouts(field_id);

-- ============================================================
-- Taxonomy Terms & Content Terms (DECI-022 binding por referência)
-- ============================================================
CREATE TABLE IF NOT EXISTS taxonomy_terms (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  taxonomy_id CHAR(36) NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id CHAR(36) REFERENCES taxonomy_terms(id) ON DELETE SET NULL,
  meta JSON NOT NULL DEFAULT ('{}'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(taxonomy_id, slug)
);

CREATE INDEX idx_taxonomy_terms_taxonomy ON taxonomy_terms(taxonomy_id);
CREATE INDEX idx_taxonomy_terms_parent ON taxonomy_terms(parent_id);

CREATE TABLE IF NOT EXISTS content_taxonomy_terms (
  content_id CHAR(36) NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  term_id CHAR(36) NOT NULL REFERENCES taxonomy_terms(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, term_id)
);

CREATE INDEX idx_content_terms_content ON content_taxonomy_terms(content_id);
CREATE INDEX idx_content_terms_term ON content_taxonomy_terms(term_id);

-- ============================================================
-- Comments (Item 11 — paridade WordPress: comentários moderados, thread)
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  content_id CHAR(36) NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  parent_id CHAR(36) REFERENCES comments(id) ON DELETE CASCADE,
  author_name VARCHAR(255) NOT NULL,
  author_email VARCHAR(255),
  author_url VARCHAR(500),
  author_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ip_address VARCHAR(64),
  user_agent VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_content_status ON comments(content_id, status);
CREATE INDEX idx_comments_tenant_status ON comments(tenant_id, status);
CREATE INDEX idx_comments_parent ON comments(parent_id);

CREATE TABLE IF NOT EXISTS comment_meta (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  comment_id CHAR(36) NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  `key` VARCHAR(191) NOT NULL,
  value JSON,
  UNIQUE(comment_id, `key`)
);

-- ============================================================
-- Mails (Item 12 — paridade WordPress: outbox durável para api.mail.send)
-- ============================================================
CREATE TABLE IF NOT EXISTS mails (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
  plugin_name VARCHAR(255) NOT NULL,
  to_email VARCHAR(320) NOT NULL,
  subject VARCHAR(998) NOT NULL,
  html TEXT,
  text TEXT,
  template VARCHAR(191),
  params JSON,
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mails_tenant_status ON mails(tenant_id, status);

-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tenant-scoped tables
-- RLS Policies using app.current_tenant_id session variable
-- Refresh token lookup happens before the access-token tenant context exists.
-- The application sets this transaction-local hash only during auth operations,
-- so RLS still permits exactly one opaque token lookup without exposing the
-- sessions table to requests from another tenant.
-- Lookup da API `key` acontece ANTES do contexto de tenant do access token
-- existir (é o próprio login). O app seta este hash transacional somente na
-- operação de auth, então o RLS ainda permite exatamente UM lookup por
-- prefixo sem expor a tabela a requisições de outro tenant.
-- ============================================================
-- Delta de dados (idempotente, best-effort): valor neutro para a
-- posição do field group em bancos já existentes. Falhas viram
-- WARNING e nunca bloqueiam o bootstrap.
-- ============================================================
-- ============================================================
-- Delta de dados (idempotente, best-effort): normaliza a chave de
-- layout dos registros existentes para `fc_layout` (chaves legadas
-- terminadas em `_fc_layout`), em content.body, content.data,
-- content_versions.body e field_values.value. Varre tenant a
-- tenant porque content tem FORCE ROW LEVEL SECURITY.
-- ============================================================
-- ============================================================
-- Delta de dados (idempotente, best-effort): field_values não pode
-- ficar órfã. 1) remove values cujo campo definição não existe mais;
-- 2) remove values de termos apagados (taxonomy_terms é delete duro e
--    entity_id é polimórfico, sem FK); 3) garante a FK ON DELETE CASCADE
--    do campo (tabelas criadas por versões antigas do `schema` podem não
--    tê-la — sem ela, apagar grupos/campos deixa values para trás).
-- content é soft-delete (TRASHED), então nunca há órfãs do lado de
-- content. Falhas viram WARNING e não bloqueiam o bootstrap.
-- ============================================================
