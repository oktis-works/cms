-- @okcms domain=tenant_data provider=postgres
-- +migrate Up
ALTER TABLE settings ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'internal';

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC) AS row_number
  FROM settings
  WHERE tenant_id IS NULL
)
DELETE FROM settings
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

UPDATE settings
SET visibility = 'public'
WHERE key IN (
  'siteTitle', 'siteDescription', 'siteUrl', 'language',
  'seo.robotsEnabled', 'seo.robotsRules', 'seo.defaultRobots',
  'seo.sitemapEnabled', 'seo.sitemapMaxItems', 'seo.sitemapIncludeTypes',
  'seo.defaultChangefreq', 'seo.defaultPriority', 'seo.ogType',
  'seo.ogImage', 'seo.twitterCard'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_global_key ON settings(key) WHERE tenant_id IS NULL;

-- +migrate Down
DROP INDEX IF EXISTS uq_settings_global_key;
ALTER TABLE settings DROP COLUMN IF EXISTS visibility;
