-- @okcms domain=core_schema provider=postgres
-- Add parent_id to content for hierarchical URLs and url_redirects table for persistent redirects.
-- Enables dynamic hierarchy: hub pages per type (base) + nested items under parent.

-- 1) parent_id in content (self-reference, same tenant, SET NULL on delete)
-- Cycle prevention and same-type enforcement handled in application layer (content service).
ALTER TABLE content
  ADD COLUMN IF NOT EXISTS parent_id UUID
    REFERENCES content(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_parent ON content(parent_id);
CREATE INDEX IF NOT EXISTS idx_content_tenant_type_parent ON content(tenant_id, type, parent_id);

-- 2) Persistent redirects table (exact + prefix rules)
-- Stores redirects from old URLs to new ones when:
--   - slug changes (exact)
--   - parent changes (exact)
--   - hub page slug changes = base rename (prefix: /old-base/* -> /new-base/*)
CREATE TABLE IF NOT EXISTS url_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,          -- path without leading slash, e.g. 'blog/*' or 'projects/cliente-a/projeto-1'
  target_path TEXT NOT NULL,          -- path without leading slash, e.g. 'noticias/*'
  redirect_type SMALLINT NOT NULL DEFAULT 301, -- 301 or 302
  is_prefix BOOLEAN NOT NULL DEFAULT false,   -- true = prefix match (source_path ends with *)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT                         -- e.g. 'slug_change', 'parent_change', 'base_rename'
);

CREATE INDEX IF NOT EXISTS idx_url_redirects_tenant_source ON url_redirects(tenant_id, source_path);
CREATE INDEX IF NOT EXISTS idx_url_redirects_tenant_prefix ON url_redirects(tenant_id) WHERE is_prefix = true;