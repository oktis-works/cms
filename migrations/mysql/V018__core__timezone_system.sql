-- @okcms domain=core_schema provider=mysql
-- +migrate Up
-- WordPress-style timezone system
-- 1. Add published_at_gmt to content table for dual date storage (local + GMT)
-- 2. Add timezone settings to settings table (handled by seed)

-- Add published_at_gmt column to content table
ALTER TABLE content ADD COLUMN published_at_gmt TIMESTAMP;

-- Index for GMT-based queries (archives, scheduling, etc.)
CREATE INDEX idx_content_published_gmt ON content(published_at_gmt);

-- Backfill existing published content: published_at_gmt = published_at
-- Note: existing published_at was stored as local time without TZ info
-- We assume it was stored in the server's timezone (typically UTC)
-- This is a best-effort backfill
UPDATE content
SET published_at_gmt = published_at
WHERE published_at IS NOT NULL
  AND published_at_gmt IS NULL
  AND status = 'PUBLISHED';

-- +migrate Down
DROP INDEX IF EXISTS idx_content_published_gmt;
ALTER TABLE content DROP COLUMN IF EXISTS published_at_gmt;
