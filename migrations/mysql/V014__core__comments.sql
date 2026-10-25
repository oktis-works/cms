-- @okcms domain=core_schema provider=mysql
-- V014__core__comments.sql
-- WordPress-parity item 11: comments system (threaded, moderated, tenant RLS).

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

-- Moderation queue + per-content listing
CREATE INDEX idx_comments_content_status ON comments(content_id, status);
CREATE INDEX idx_comments_tenant_status ON comments(tenant_id, status);
CREATE INDEX idx_comments_parent ON comments(parent_id);

-- Key/value metadata (antispam scores, plugin extensions)
CREATE TABLE IF NOT EXISTS comment_meta (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    comment_id CHAR(36) NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    `key` VARCHAR(191) NOT NULL,
    value JSON,
    UNIQUE(comment_id, `key`)
);

-- Tenant isolation (same pattern as content/taxonomy_terms)
