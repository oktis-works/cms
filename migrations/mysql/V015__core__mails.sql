-- @okcms domain=core_schema provider=mysql
-- V015__core__mails.sql
-- WordPress-parity item 12: durable mail outbox for api.mail.send.

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
