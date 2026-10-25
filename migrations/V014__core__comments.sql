-- @okcms domain=core_schema provider=postgres
-- V014__core__comments.sql
-- WordPress-parity item 11: comments system (threaded, moderated, tenant RLS).

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    author_name VARCHAR(255) NOT NULL,
    author_email VARCHAR(255),
    author_url VARCHAR(500),
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    ip_address VARCHAR(64),
    user_agent VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Moderation queue + per-content listing
CREATE INDEX IF NOT EXISTS idx_comments_content_status ON comments(content_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_tenant_status ON comments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- Key/value metadata (antispam scores, plugin extensions)
CREATE TABLE IF NOT EXISTS comment_meta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    key VARCHAR(191) NOT NULL,
    value JSONB,
    UNIQUE(comment_id, key)
);

-- Tenant isolation (same pattern as content/taxonomy_terms)
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tenant_isolation_comments' AND tablename = 'comments'
  ) THEN
    CREATE POLICY tenant_isolation_comments ON comments
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
  END IF;
END $$;

ALTER TABLE comment_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_meta FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tenant_isolation_comment_meta' AND tablename = 'comment_meta'
  ) THEN
    CREATE POLICY tenant_isolation_comment_meta ON comment_meta
      USING (EXISTS (
        SELECT 1 FROM comments c
        WHERE c.id = comment_meta.comment_id
          AND (c.tenant_id = current_setting('app.current_tenant_id', true)::uuid OR c.tenant_id IS NULL)
      ));
  END IF;
END $$;
