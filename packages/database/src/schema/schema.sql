-- OkCMS v2 - Database Schema
-- Generated from SDD specification

-- ============================================================
-- Tenants
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  domain VARCHAR(255),
  subdomain VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  settings JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain) WHERE subdomain IS NOT NULL;

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(511) NOT NULL,
  avatar VARCHAR(511),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED')),
  locale VARCHAR(10),
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Idempotente para bancos criados antes do i18n do admin (V005).
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ============================================================
-- Roles
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_slug ON roles(slug);

-- ============================================================
-- Tenant Users (many-to-many with role)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);

-- ============================================================
-- Permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  scope VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_permissions_slug ON permissions(slug);

-- ============================================================
-- Content
-- ============================================================
CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  body JSONB,
  excerpt TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'TRASHED')),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  featured_image_id UUID,
  seo_title VARCHAR(500),
  seo_description TEXT,
  metadata JSONB,
  published_at TIMESTAMP WITH TIME ZONE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_tenant ON content(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_slug ON content(tenant_id, type, slug);
CREATE INDEX IF NOT EXISTS idx_content_author ON content(author_id);
CREATE INDEX IF NOT EXISTS idx_content_published ON content(published_at) WHERE published_at IS NOT NULL;
ALTER TABLE content ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE content ADD COLUMN IF NOT EXISTS layout VARCHAR(255);

-- ============================================================
-- Content Versions
-- ============================================================
CREATE TABLE IF NOT EXISTS content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  body JSONB,
  excerpt TEXT,
  featured_image_id UUID,
  seo_title VARCHAR(500),
  seo_description TEXT,
  metadata JSONB,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE content_versions ADD COLUMN IF NOT EXISTS slug VARCHAR(500);
ALTER TABLE content_versions ADD COLUMN IF NOT EXISTS excerpt TEXT;
ALTER TABLE content_versions ADD COLUMN IF NOT EXISTS featured_image_id UUID;
ALTER TABLE content_versions ADD COLUMN IF NOT EXISTS seo_title VARCHAR(500);
ALTER TABLE content_versions ADD COLUMN IF NOT EXISTS seo_description TEXT;

CREATE INDEX IF NOT EXISTS idx_content_versions_content ON content_versions(content_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_version ON content_versions(content_id, version DESC);

-- ============================================================
-- Media
-- ============================================================
CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  size INTEGER NOT NULL,
  path VARCHAR(1000) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  alt VARCHAR(500),
  caption TEXT,
  metadata JSONB,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_mime ON media(mime_type);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_by ON media(uploaded_by);

-- ============================================================
-- Categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- ============================================================
-- Tags
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_tenant ON tags(tenant_id);

-- ============================================================
-- Content Tags (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS content_tags (
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_content_tags_content ON content_tags(content_id);
CREATE INDEX IF NOT EXISTS idx_content_tags_tag ON content_tags(tag_id);

-- ============================================================
-- Content Categories (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS content_categories (
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_content_categories_content ON content_categories(content_id);
CREATE INDEX IF NOT EXISTS idx_content_categories_category ON content_categories(category_id);

-- ============================================================
-- Menus
-- ============================================================
CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menus_tenant ON menus(tenant_id);

-- ============================================================
-- Settings
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value JSONB NOT NULL,
  "group" VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(key, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settings_group ON settings("group");

-- ============================================================
-- Plugins
-- ============================================================
CREATE TABLE IF NOT EXISTS plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN (
    'DISCOVERED', 'VALIDATED', 'INSTALLED', 'MIGRATED', 'ACTIVATED', 'RUNNING',
    'DEACTIVATED', 'UNINSTALLED', 'INSTALL_FAILED', 'MIGRATION_FAILED',
    'ACTIVATION_FAILED', 'INCOMPATIBLE', 'QUARANTINED'
  )),
  manifest JSONB NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB,
  installed_at TIMESTAMP WITH TIME ZONE,
  activated_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plugins_tenant ON plugins(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);
CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);

-- ============================================================
-- Plugin Dependencies
-- ============================================================
CREATE TABLE IF NOT EXISTS plugin_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  dependency_id UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  version_range VARCHAR(100) NOT NULL,
  optional BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_plugin_dependencies_plugin ON plugin_dependencies(plugin_id);

-- ============================================================
-- Themes
-- ============================================================
CREATE TABLE IF NOT EXISTS themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'INSTALLED' CHECK (status IN ('ACTIVE', 'INACTIVE', 'INSTALLED')),
  manifest JSONB NOT NULL,
  config JSONB,
  installed_at TIMESTAMP WITH TIME ZONE,
  activated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_themes_tenant ON themes(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name);
CREATE INDEX IF NOT EXISTS idx_themes_status ON themes(status);

-- ============================================================
-- Builds
-- ============================================================
CREATE TABLE IF NOT EXISTS builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  core_version VARCHAR(50) NOT NULL,
  plugins JSONB NOT NULL DEFAULT '{}'::jsonb,
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  docker_image VARCHAR(500),
  checksum VARCHAR(255),
  build_log TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builds_tenant ON builds(tenant_id);
CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status);

-- ============================================================
-- Deployments
-- ============================================================
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  build_id UUID NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'QUEUED', 'BUILDING', 'TESTING', 'PACKAGING', 'PUSHING',
    'DEPLOYING', 'HEALTH_CHECK', 'ACTIVE', 'FAILED', 'CANCELLED', 'ROLLED_BACK'
  )),
  core_version VARCHAR(50) NOT NULL,
  theme_version VARCHAR(50),
  plugin_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  docker_image VARCHAR(500),
  checksum VARCHAR(255) NOT NULL,
  rollback_to_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  health_check_status VARCHAR(20) CHECK (health_check_status IN ('PASSING', 'FAILING', 'PENDING')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_tenant ON deployments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_build ON deployments(build_id);

-- ============================================================
-- Events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- RULE-event-idempotency: eventos que esgotam retries vão para DLQ durável
CREATE TABLE IF NOT EXISTS dead_letter_events (
  id UUID PRIMARY KEY,
  type VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dle_type ON dead_letter_events(type);
CREATE INDEX IF NOT EXISTS idx_dle_created ON dead_letter_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

-- ============================================================
-- Audit Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(255) NOT NULL,
  resource_id UUID,
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================================
-- Migrations
-- ============================================================
CREATE TABLE IF NOT EXISTS migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner VARCHAR(255) NOT NULL,
  owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('CORE', 'PLUGIN')),
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  checksum VARCHAR(255) NOT NULL,
  UNIQUE(tenant_id, owner, version)
);

CREATE INDEX IF NOT EXISTS idx_migrations_tenant ON migrations(tenant_id);

-- ============================================================
-- Components
-- ============================================================
CREATE TABLE IF NOT EXISTS components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('CORE', 'THEME', 'PLUGIN')),
  source_id UUID,
  version VARCHAR(50) NOT NULL,
  schema JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_components_name ON components(name);
CREATE INDEX IF NOT EXISTS idx_components_source ON components(source);

-- ============================================================
-- Content Types
-- ============================================================
CREATE TABLE IF NOT EXISTS content_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(20) NOT NULL CHECK (source IN ('CORE', 'PLUGIN')),
  source_id UUID,
  schema JSONB NOT NULL,
  plural_label VARCHAR(255) NOT NULL,
  singular_label VARCHAR(255) NOT NULL,
  default_fields JSONB NOT NULL DEFAULT '["title","slug","content","excerpt","featured_image","seo_title","seo_description","status","author"]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_types_slug ON content_types(slug);

-- Add new columns to existing content_types table (idempotent)
ALTER TABLE content_types ADD COLUMN IF NOT EXISTS default_fields JSONB NOT NULL DEFAULT '["title","slug","content","excerpt","featured_image","seo_title","seo_description","status","author"]'::jsonb;
ALTER TABLE content_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- Webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url VARCHAR(1000) NOT NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);

-- ============================================================
-- Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================================
-- Custom Taxonomies (SDD ENTI-025)
-- ============================================================
CREATE TABLE IF NOT EXISTS taxonomies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  hierarchical BOOLEAN NOT NULL DEFAULT false,
  attach_to JSONB NOT NULL DEFAULT '[]'::jsonb,
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(20) NOT NULL DEFAULT 'ADMIN' CHECK (source IN ('CORE', 'PLUGIN', 'ADMIN')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_taxonomies_tenant ON taxonomies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_taxonomies_slug ON taxonomies(slug);
ALTER TABLE taxonomies ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_taxonomies' AND tablename = 'taxonomies'
  ) THEN
    CREATE POLICY tenant_isolation_taxonomies ON taxonomies USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
  END IF;
END $$;

-- ============================================================
-- Field Groups (SDD ENTI-026)
-- ============================================================
CREATE TABLE IF NOT EXISTS field_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  key VARCHAR(255) NOT NULL UNIQUE,
  location_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  position VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (position IN ('normal', 'side', 'acf_after_title')),
  display_style VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (display_style IN ('standard', 'seamless', 'grouped')),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_groups_tenant ON field_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_field_groups_active ON field_groups(active);
ALTER TABLE field_groups ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_field_groups' AND tablename = 'field_groups'
  ) THEN
    CREATE POLICY tenant_isolation_field_groups ON field_groups USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
  END IF;
END $$;

-- ============================================================
-- Field Definitions (SDD ENTI-027)
-- ============================================================
CREATE TABLE IF NOT EXISTS field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES field_groups(id) ON DELETE CASCADE,
  parent_field_id UUID REFERENCES field_definitions(id) ON DELETE CASCADE,
  layout_id UUID,
  type VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  key VARCHAR(255) NOT NULL UNIQUE,
  label VARCHAR(500) NOT NULL,
  instructions TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_core_field BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  core_field_key VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add new columns to existing field_definitions table (idempotent)
ALTER TABLE field_definitions ADD COLUMN IF NOT EXISTS is_core_field BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE field_definitions ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE field_definitions ADD COLUMN IF NOT EXISTS core_field_key VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_field_definitions_group ON field_definitions(group_id);
CREATE INDEX IF NOT EXISTS idx_field_definitions_parent ON field_definitions(parent_field_id) WHERE parent_field_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_definitions_core ON field_definitions(is_core_field) WHERE is_core_field = true;
CREATE INDEX IF NOT EXISTS idx_field_definitions_locked ON field_definitions(is_locked) WHERE is_locked = true;
CREATE INDEX IF NOT EXISTS idx_field_definitions_core_key ON field_definitions(core_field_key) WHERE core_field_key IS NOT NULL;
ALTER TABLE field_definitions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_field_definitions' AND tablename = 'field_definitions'
  ) THEN
    CREATE POLICY tenant_isolation_field_definitions ON field_definitions USING (EXISTS (
    SELECT 1 FROM field_groups fg
    WHERE fg.id = field_definitions.group_id
      AND (fg.tenant_id = current_setting('app.current_tenant_id', true)::uuid OR fg.tenant_id IS NULL)
  ));
  END IF;
END $$;

-- ============================================================
-- Field Values (valores isolados por entidade)
-- ============================================================
CREATE TABLE IF NOT EXISTS field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_definition_id UUID NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('content', 'taxonomy_term')),
  entity_id UUID NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(field_definition_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_field_values_entity ON field_values(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field ON field_values(field_definition_id);
CREATE INDEX IF NOT EXISTS idx_field_values_updated ON field_values(updated_at DESC);

CREATE OR REPLACE FUNCTION update_field_values_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_field_values_updated ON field_values;
CREATE TRIGGER trg_field_values_updated
  BEFORE UPDATE ON field_values
  FOR EACH ROW EXECUTE FUNCTION update_field_values_timestamp();

-- ============================================================
-- Flexible Layouts (SDD ENTI-028)
-- ============================================================
CREATE TABLE IF NOT EXISTS flexible_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  label VARCHAR(500) NOT NULL,
  display VARCHAR(20) NOT NULL DEFAULT 'block' CHECK (display IN ('block', 'table', 'row')),
  min INTEGER,
  max INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(field_id, name)
);

CREATE INDEX IF NOT EXISTS idx_flexible_layouts_field ON flexible_layouts(field_id);

-- ============================================================
-- Taxonomy Terms & Content Terms (DECI-022 binding por referência)
-- ============================================================
CREATE TABLE IF NOT EXISTS taxonomy_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy_id UUID NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES taxonomy_terms(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(taxonomy_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_taxonomy ON taxonomy_terms(taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_parent ON taxonomy_terms(parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS content_taxonomy_terms (
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES taxonomy_terms(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_content_terms_content ON content_taxonomy_terms(content_id);
CREATE INDEX IF NOT EXISTS idx_content_terms_term ON content_taxonomy_terms(term_id);

-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- RLS Policies using app.current_tenant_id session variable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_content' AND tablename = 'content'
  ) THEN
    CREATE POLICY tenant_isolation_content ON content USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_media' AND tablename = 'media'
  ) THEN
    CREATE POLICY tenant_isolation_media ON media USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_categories' AND tablename = 'categories'
  ) THEN
    CREATE POLICY tenant_isolation_categories ON categories USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_tags' AND tablename = 'tags'
  ) THEN
    CREATE POLICY tenant_isolation_tags ON tags USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_menus' AND tablename = 'menus'
  ) THEN
    CREATE POLICY tenant_isolation_menus ON menus USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_settings' AND tablename = 'settings'
  ) THEN
    CREATE POLICY tenant_isolation_settings ON settings USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_plugins' AND tablename = 'plugins'
  ) THEN
    CREATE POLICY tenant_isolation_plugins ON plugins USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_themes' AND tablename = 'themes'
  ) THEN
    CREATE POLICY tenant_isolation_themes ON themes USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_builds' AND tablename = 'builds'
  ) THEN
    CREATE POLICY tenant_isolation_builds ON builds USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_deployments' AND tablename = 'deployments'
  ) THEN
    CREATE POLICY tenant_isolation_deployments ON deployments USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_events' AND tablename = 'events'
  ) THEN
    CREATE POLICY tenant_isolation_events ON events USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_audit_logs' AND tablename = 'audit_logs'
  ) THEN
    CREATE POLICY tenant_isolation_audit_logs ON audit_logs USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_sessions' AND tablename = 'sessions'
  ) THEN
    CREATE POLICY tenant_isolation_sessions ON sessions USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'tenant_isolation_webhooks' AND tablename = 'webhooks'
  ) THEN
    CREATE POLICY tenant_isolation_webhooks ON webhooks USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
END $$;
