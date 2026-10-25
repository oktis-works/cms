-- +migrate Up
-- Make body the single canonical content document while preserving legacy
-- native columns, data, and relational field_values as read-only inputs.

CREATE TABLE IF NOT EXISTS content_value_migration_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL,
  sources JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(content_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_content_value_migration_conflicts_content
  ON content_value_migration_conflicts(content_id);

CREATE OR REPLACE FUNCTION okcms_json_object(value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF value IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(value) = 'object' THEN RETURN value; END IF;
  IF jsonb_typeof(value) = 'string' THEN
    BEGIN
      RETURN (value #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      RETURN '{}'::jsonb;
    END;
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

INSERT INTO content_value_migration_conflicts (content_id, field_name, sources)
SELECT c.id, keys.key,
       jsonb_build_object('body', body_values->keys.key, 'data', data_values->keys.key)
FROM content c
CROSS JOIN LATERAL (SELECT okcms_json_object(c.body) AS body_values,
                           okcms_json_object(c.data) AS data_values) sources
CROSS JOIN LATERAL jsonb_object_keys(sources.body_values || sources.data_values) keys(key)
WHERE sources.body_values ? keys.key
  AND sources.data_values ? keys.key
  AND sources.body_values->keys.key IS DISTINCT FROM sources.data_values->keys.key
ON CONFLICT (content_id, field_name) DO NOTHING;

WITH relational AS (
  SELECT fv.entity_id,
         jsonb_object_agg(fd.name, fv.value) AS relational_values
  FROM field_values fv
  JOIN field_definitions fd ON fd.id = fv.field_definition_id
  WHERE fv.entity_type = 'content'
  GROUP BY fv.entity_id
), source_values AS (
  SELECT c.id,
         jsonb_build_object(
           'title', c.title,
           'slug', c.slug,
           'excerpt', c.excerpt,
           'featured_image', c.featured_image_id,
           'seo_title', c.seo_title,
           'seo_description', c.seo_description,
           'status', c.status,
           'author', c.author_id
         ) || okcms_json_object(c.data) || COALESCE(relational.relational_values, '{}'::jsonb) || okcms_json_object(c.body) AS logical_values
  FROM content c
  LEFT JOIN relational ON relational.entity_id = c.id
)
UPDATE content c
SET body = jsonb_strip_nulls(
  source_values.logical_values
  || jsonb_build_object(
    'content', COALESCE(source_values.logical_values->'content', source_values.logical_values->'html')
  )
  - 'html' - 'featuredImageId' - 'featured_image_id' - 'seoTitle' - 'seoDescription'
),
data = '{}'::jsonb
FROM source_values
WHERE source_values.id = c.id;

UPDATE content_versions v
SET body = jsonb_strip_nulls(
  jsonb_build_object(
    'title', v.title,
    'slug', v.slug,
    'excerpt', v.excerpt,
    'featured_image', v.featured_image_id,
    'seo_title', v.seo_title,
    'seo_description', v.seo_description
  ) || okcms_json_object(v.body)
  - 'html' - 'featuredImageId' - 'featured_image_id' - 'seoTitle' - 'seoDescription'
);

DROP FUNCTION okcms_json_object(jsonb);

-- +migrate Down
-- The canonicalization is intentionally one-way. Restore content and
-- content_versions from the database backup captured before this migration.
DROP TABLE IF EXISTS content_value_migration_conflicts;
