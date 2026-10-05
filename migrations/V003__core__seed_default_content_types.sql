-- +migrate Up
-- Seed: Content Types padrão (Post, Page) com campos padrão

-- Content Types padrão
INSERT INTO content_types (name, slug, source, schema, plural_label, singular_label, default_fields)
VALUES 
  (
    'Post', 'post', 'CORE', '{}'::jsonb,
    'Posts', 'Post',
    '["title","slug","content","excerpt","featured_image","seo_title","seo_description","status","author"]'::jsonb
  ),
  (
    'Page', 'page', 'CORE', '{}'::jsonb,
    'Pages', 'Page',
    '["title","slug","content","excerpt","featured_image","seo_title","seo_description","status","author"]'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  default_fields = EXCLUDED.default_fields,
  updated_at = NOW();

-- +migrate Down
DELETE FROM content_types WHERE slug IN ('post', 'page') AND source = 'CORE';