-- V016__core__webhook_hardening.sql
-- WordPress-parity item 19: webhook secret rotation with 24h grace + a
-- dead-letter table for undeliverable deliveries.

-- One row per secret version. The newest is_active row signs outgoing
-- deliveries (X-Webhook-Secret-Version tells the consumer which key to
-- verify with). During rotation the previous version stays recorded with
-- rotated_at — consumers have a 24h grace window to swap the key.
CREATE TABLE IF NOT EXISTS webhook_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    secret VARCHAR(255) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    rotated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(webhook_id, version)
);

CREATE INDEX IF NOT EXISTS idx_webhook_secrets_webhook ON webhook_secrets(webhook_id, is_active);

-- Deliveries that exhausted their retries (network errors / non-2xx) are
-- recorded here for inspection and replay; attempts accumulates per
-- webhook+event across delivery jobs.
CREATE TABLE IF NOT EXISTS webhook_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event VARCHAR(191) NOT NULL,
    payload JSONB NOT NULL,
    error TEXT,
    attempts INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_dead_letters_webhook ON webhook_dead_letters(webhook_id, created_at);
