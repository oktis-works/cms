-- @okcms domain=core_schema provider=postgres
-- +migrate Up
-- WordPress-style timezone system
-- 1. Add published_at_gmt to content table for dual date storage (local + GMT)
-- 2. Add timezone settings to settings table (handled by seed)

-- Add published_at_gmt column to content table
ALTER TABLE content ADD COLUMN IF NOT EXISTS published_at_gmt TIMESTAMP WITH TIME ZONE;

-- Index for GMT-based queries (archives, scheduling, etc.)
CREATE INDEX IF NOT EXISTS idx_content_published_gmt ON content(published_at_gmt) WHERE published_at_gmt IS NOT NULL;

-- Backfill existing published content: published_at_gmt = published_at AT TIME ZONE 'UTC'
-- Note: existing published_at was stored as local time without TZ info
-- We assume it was stored in the server's timezone (typically UTC)
-- This is a best-effort backfill
UPDATE content
SET published_at_gmt = published_at AT TIME ZONE 'UTC'
WHERE published_at IS NOT NULL
  AND published_at_gmt IS NULL
  AND status = 'PUBLISHED';

-- +migrate Down
DROP INDEX IF EXISTS idx_content_published_gmt;
ALTER TABLE content DROP COLUMN IF EXISTS published_at_gmt;
