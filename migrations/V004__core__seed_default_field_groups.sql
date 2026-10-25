-- +migrate Up
-- Seed: Field Groups + Core Fields para Post e Page
-- Cria field_groups com location_rules e field_definitions (core fields)

-- Variáveis para IDs (usando CTEs para capturar IDs)
WITH pg AS (
  INSERT INTO field_groups (tenant_id, title, key, location_rules, position, display_style, active, metadata)
  VALUES (
    NULL,
    'Campos Padrão - Post',
    'core-fields-post',
    '{"content_type": ["post"]}'::jsonb,
    'normal', 'standard', true, '{}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id AS group_id
),
pa AS (
  INSERT INTO field_groups (tenant_id, title, key, location_rules, position, display_style, active, metadata)
  VALUES (
    NULL,
    'Campos Padrão - Page',
    'core-fields-page',
    '{"content_type": ["page"]}'::jsonb,
    'normal', 'standard', true, '{}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id AS group_id
),
-- Inserir core fields para Post
pf AS (
  INSERT INTO field_definitions (
    group_id, parent_field_id, type, name, key, label, instructions,
    required, config, sort_order, is_core_field, is_locked, core_field_key
  )
  SELECT 
    pg.group_id,
    NULL,
    v.type, v.name, v.key, v.label, v.instructions,
    v.required, v.config::jsonb, v.sort_order,
    true, v.is_locked, v.core_field_key
  FROM pg
  CROSS JOIN (VALUES
    ('text', 'title', 'title', 'Title', 'Post title', true, '{}'::jsonb, 1, true, 'title'),
    ('slug', 'slug', 'slug', 'Slug', 'Unique public URL slug', true, '{}'::jsonb, 2, true, 'slug'),
    ('wysiwyg', 'content', 'content', 'Content', 'Main post content', true, '{}'::jsonb, 3, false, 'content'),
    ('textarea', 'excerpt', 'excerpt', 'Excerpt', 'Short summary for listings', false, '{}'::jsonb, 4, false, 'excerpt'),
    ('image', 'featured_image', 'featured_image', 'Featured Image', 'Primary post image', false, '{}'::jsonb, 5, false, 'featured_image'),
    ('text', 'seo_title', 'seo_title', 'SEO Title', 'SEO meta title', false, '{}'::jsonb, 6, false, 'seo_title'),
    ('textarea', 'seo_description', 'seo_description', 'SEO Description', 'SEO meta description', false, '{}'::jsonb, 7, false, 'seo_description'),
    ('select', 'status', 'status', 'Status', 'Publication status', true, '{"options":[{"value":"DRAFT","label":"Draft"},{"value":"PUBLISHED","label":"Published"},{"value":"ARCHIVED","label":"Archived"},{"value":"TRASHED","label":"Trash"}]}'::jsonb, 8, false, 'status'),
    ('user', 'author', 'author', 'Author', 'Post author', true, '{}'::jsonb, 9, false, 'author')
  ) AS v(type, name, key, label, instructions, required, config, sort_order, is_locked, core_field_key)
  ON CONFLICT (key) DO NOTHING
  RETURNING id
),
-- Inserir core fields para Page
pa_f AS (
  INSERT INTO field_definitions (
    group_id, parent_field_id, type, name, key, label, instructions,
    required, config, sort_order, is_core_field, is_locked, core_field_key
  )
  SELECT 
    pa.group_id,
    NULL,
    v.type, v.name, v.key, v.label, v.instructions,
    v.required, v.config::jsonb, v.sort_order,
    true, v.is_locked, v.core_field_key
  FROM pa
  CROSS JOIN (VALUES
    ('text', 'title', 'page_title', 'Title', 'Page title', true, '{}'::jsonb, 1, true, 'title'),
    ('slug', 'slug', 'page_slug', 'Slug', 'Unique public URL slug', true, '{}'::jsonb, 2, true, 'slug'),
    ('wysiwyg', 'content', 'page_content', 'Content', 'Main page content', true, '{}'::jsonb, 3, false, 'content'),
    ('textarea', 'excerpt', 'page_excerpt', 'Excerpt', 'Short summary for listings', false, '{}'::jsonb, 4, false, 'excerpt'),
    ('image', 'featured_image', 'page_featured_image', 'Featured Image', 'Primary page image', false, '{}'::jsonb, 5, false, 'featured_image'),
    ('text', 'seo_title', 'page_seo_title', 'SEO Title', 'SEO meta title', false, '{}'::jsonb, 6, false, 'seo_title'),
    ('textarea', 'seo_description', 'page_seo_description', 'SEO Description', 'SEO meta description', false, '{}'::jsonb, 7, false, 'seo_description'),
    ('select', 'status', 'page_status', 'Status', 'Publication status', true, '{"options":[{"value":"DRAFT","label":"Draft"},{"value":"PUBLISHED","label":"Published"},{"value":"ARCHIVED","label":"Archived"},{"value":"TRASHED","label":"Trash"}]}'::jsonb, 8, false, 'status'),
    ('user', 'author', 'page_author', 'Author', 'Page author', true, '{}'::jsonb, 9, false, 'author')
  ) AS v(type, name, key, label, instructions, required, config, sort_order, is_locked, core_field_key)
  ON CONFLICT (key) DO NOTHING
  RETURNING id
)
SELECT 1;

-- +migrate Down
DELETE FROM field_definitions WHERE key IN (
  'title', 'slug', 'content', 'excerpt', 'featured_image',
  'seo_title', 'seo_description', 'status', 'author',
  'page_title', 'page_slug', 'page_content', 'page_excerpt', 'page_featured_image',
  'page_seo_title', 'page_seo_description', 'page_status', 'page_author'
) AND is_core_field = true;

DELETE FROM field_groups WHERE key IN ('core-fields-post', 'core-fields-page');
