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
  ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    location_rules = EXCLUDED.location_rules,
    active = EXCLUDED.active,
    updated_at = NOW()
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
  ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    location_rules = EXCLUDED.location_rules,
    active = EXCLUDED.active,
    updated_at = NOW()
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
    ('text', 'title', 'title', 'Título', 'Título do post', true, '{}'::jsonb, 1, true, 'title'),
    ('slug', 'slug', 'slug', 'Slug', 'URL amigável (único)', true, '{}'::jsonb, 2, true, 'slug'),
    ('wysiwyg', 'content', 'content', 'Conteúdo', 'Corpo principal do post', true, '{}'::jsonb, 3, false, 'content'),
    ('textarea', 'excerpt', 'excerpt', 'Resumo', 'Resumo curto para listagens', false, '{}'::jsonb, 4, false, 'excerpt'),
    ('image', 'featured_image', 'featured_image', 'Imagem Destacada', 'Imagem principal do post', false, '{}'::jsonb, 5, false, 'featured_image'),
    ('text', 'seo_title', 'seo_title', 'SEO Title', 'Título para SEO (meta title)', false, '{}'::jsonb, 6, false, 'seo_title'),
    ('textarea', 'seo_description', 'seo_description', 'SEO Description', 'Descrição para SEO (meta description)', false, '{}'::jsonb, 7, false, 'seo_description'),
    ('select', 'status', 'status', 'Status', 'Status de publicação', true, '{"options":[{"value":"DRAFT","label":"Rascunho"},{"value":"PUBLISHED","label":"Publicado"},{"value":"ARCHIVED","label":"Arquivado"},{"value":"TRASHED","label":"Lixeira"}]}'::jsonb, 8, false, 'status'),
    ('user', 'author', 'author', 'Autor', 'Autor do post', true, '{}'::jsonb, 9, false, 'author')
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
    ('text', 'title', 'title', 'Título', 'Título da página', true, '{}'::jsonb, 1, true, 'title'),
    ('slug', 'slug', 'slug', 'Slug', 'URL amigável (único)', true, '{}'::jsonb, 2, true, 'slug'),
    ('wysiwyg', 'content', 'content', 'Conteúdo', 'Corpo principal da página', true, '{}'::jsonb, 3, false, 'content'),
    ('textarea', 'excerpt', 'excerpt', 'Resumo', 'Resumo curto para listagens', false, '{}'::jsonb, 4, false, 'excerpt'),
    ('image', 'featured_image', 'featured_image', 'Imagem Destacada', 'Imagem principal da página', false, '{}'::jsonb, 5, false, 'featured_image'),
    ('text', 'seo_title', 'seo_title', 'SEO Title', 'Título para SEO (meta title)', false, '{}'::jsonb, 6, false, 'seo_title'),
    ('textarea', 'seo_description', 'seo_description', 'SEO Description', 'Descrição para SEO (meta description)', false, '{}'::jsonb, 7, false, 'seo_description'),
    ('select', 'status', 'status', 'Status', 'Status de publicação', true, '{"options":[{"value":"DRAFT","label":"Rascunho"},{"value":"PUBLISHED","label":"Publicado"},{"value":"ARCHIVED","label":"Arquivado"},{"value":"TRASHED","label":"Lixeira"}]}'::jsonb, 8, false, 'status'),
    ('user', 'author', 'author', 'Autor', 'Autor da página', true, '{}'::jsonb, 9, false, 'author')
  ) AS v(type, name, key, label, instructions, required, config, sort_order, is_locked, core_field_key)
  ON CONFLICT (key) DO NOTHING
  RETURNING id
)
SELECT 1;

-- +migrate Down
DELETE FROM field_definitions WHERE key IN (
  'title', 'slug', 'content', 'excerpt', 'featured_image',
  'seo_title', 'seo_description', 'status', 'author'
) AND is_core_field = true;

DELETE FROM field_groups WHERE key IN ('core-fields-post', 'core-fields-page');