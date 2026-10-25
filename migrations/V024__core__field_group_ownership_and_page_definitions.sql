-- +migrate Up
-- Scope tenant field-group keys and repair page core definitions on upgrades.

ALTER TABLE field_groups DROP CONSTRAINT IF EXISTS field_groups_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS field_groups_global_key_unique
  ON field_groups (key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS field_groups_tenant_key_unique
  ON field_groups (tenant_id, key) WHERE tenant_id IS NOT NULL;

WITH page_group AS (
  SELECT id
  FROM field_groups
  WHERE key = 'core-fields-page' AND tenant_id IS NULL
  LIMIT 1
),
page_fields(type, name, key, label, instructions, required, config, sort_order, is_locked, core_field_key) AS (
  VALUES
    ('text', 'title', 'page_title', 'Title', 'Page title', true, '{}'::jsonb, 1, true, 'title'),
    ('slug', 'slug', 'page_slug', 'Slug', 'Public URL slug', true, '{}'::jsonb, 2, true, 'slug'),
    ('wysiwyg', 'content', 'page_content', 'Content', 'Main page content', true, '{}'::jsonb, 3, false, 'content'),
    ('textarea', 'excerpt', 'page_excerpt', 'Excerpt', 'Short summary for listings', false, '{}'::jsonb, 4, false, 'excerpt'),
    ('image', 'featured_image', 'page_featured_image', 'Featured Image', 'Primary page image', false, '{}'::jsonb, 5, false, 'featured_image'),
    ('text', 'seo_title', 'page_seo_title', 'SEO Title', 'SEO title', false, '{}'::jsonb, 6, false, 'seo_title'),
    ('textarea', 'seo_description', 'page_seo_description', 'SEO Description', 'SEO description', false, '{}'::jsonb, 7, false, 'seo_description'),
    ('select', 'status', 'page_status', 'Status', 'Publication status', true, '{"options":[{"value":"DRAFT","label":"Draft"},{"value":"PUBLISHED","label":"Published"},{"value":"ARCHIVED","label":"Archived"},{"value":"TRASHED","label":"Trash"}]}'::jsonb, 8, false, 'status'),
    ('user', 'author', 'page_author', 'Author', 'Page author', true, '{}'::jsonb, 9, false, 'author')
)
INSERT INTO field_definitions (
  group_id, parent_field_id, type, name, key, label, instructions,
  required, config, sort_order, is_core_field, is_locked, core_field_key
)
SELECT page_group.id, NULL, page_fields.type, page_fields.name, page_fields.key,
       page_fields.label, page_fields.instructions, page_fields.required,
       page_fields.config, page_fields.sort_order, true,
       page_fields.is_locked, page_fields.core_field_key
FROM page_group
CROSS JOIN page_fields
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions existing
  WHERE existing.group_id = page_group.id
    AND existing.core_field_key = page_fields.core_field_key
)
ON CONFLICT (key) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  name = EXCLUDED.name,
  label = EXCLUDED.label,
  instructions = EXCLUDED.instructions,
  required = EXCLUDED.required,
  config = EXCLUDED.config,
  sort_order = EXCLUDED.sort_order,
  is_core_field = true,
  is_locked = EXCLUDED.is_locked,
  core_field_key = EXCLUDED.core_field_key,
  updated_at = NOW();

-- +migrate Down
DROP INDEX IF EXISTS field_groups_tenant_key_unique;
DROP INDEX IF EXISTS field_groups_global_key_unique;
ALTER TABLE field_groups ADD CONSTRAINT field_groups_key_key UNIQUE (key);
DELETE FROM field_definitions
WHERE key IN ('page_title', 'page_slug', 'page_content', 'page_excerpt',
              'page_featured_image', 'page_seo_title', 'page_seo_description',
              'page_status', 'page_author')
  AND is_core_field = true;
