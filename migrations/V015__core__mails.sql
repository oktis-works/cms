-- @okcms domain=core_schema provider=postgres
-- V015__core__mails.sql
-- WordPress-parity item 12: durable mail outbox for api.mail.send.

CREATE TABLE IF NOT EXISTS mails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    plugin_name VARCHAR(255) NOT NULL,
    to_email VARCHAR(320) NOT NULL,
    subject VARCHAR(998) NOT NULL,
    html TEXT,
    text TEXT,
    template VARCHAR(191),
    params JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    attempts INT NOT NULL DEFAULT 0,
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mails_tenant_status ON mails(tenant_id, status);

ALTER TABLE mails ENABLE ROW LEVEL SECURITY;
ALTER TABLE mails FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tenant_isolation_mails' AND tablename = 'mails'
  ) THEN
    CREATE POLICY tenant_isolation_mails ON mails
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL);
  END IF;
END $$;
