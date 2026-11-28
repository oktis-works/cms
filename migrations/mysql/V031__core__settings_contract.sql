-- @okcms domain=tenant_data provider=mysql
-- +migrate Up
-- `visibility` is part of the canonical baseline and is repaired by
-- ensureCoreSchema before tenant-data migrations run.

-- Deduplicate settings
DELETE older FROM settings older
JOIN settings newer
  ON older.tenant_id IS NULL
 AND newer.tenant_id IS NULL
 AND older.key = newer.key
 AND (older.updated_at < newer.updated_at OR (older.updated_at = newer.updated_at AND older.id < newer.id));

-- Update visibility for public settings
UPDATE settings
SET `visibility` = 'public'
WHERE key IN (
  'siteTitle', 'siteDescription', 'siteUrl', 'language',
  'seo.robotsEnabled', 'seo.robotsRules', 'seo.defaultRobots',
  'seo.sitemapEnabled', 'seo.sitemapMaxItems', 'seo.sitemapIncludeTypes',
  'seo.defaultChangefreq', 'seo.defaultPriority', 'seo.ogType',
  'seo.ogImage', 'seo.twitterCard'
);

-- Add global_key column and unique index
ALTER TABLE settings ADD COLUMN `global_key` VARCHAR(255) GENERATED ALWAYS AS (IF(tenant_id IS NULL, key, NULL)) STORED;
CREATE UNIQUE INDEX uq_settings_global_key ON settings(`global_key`);

-- +migrate Down
DROP INDEX uq_settings_global_key ON settings;
ALTER TABLE settings DROP COLUMN `global_key`, DROP COLUMN `visibility`;
