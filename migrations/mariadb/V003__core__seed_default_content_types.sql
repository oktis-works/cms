-- @okcms domain=core_schema provider=mariadb
-- +migrate Up
-- Seed: Content Types padrão (Post, Page) com campos padrão

-- Content Types padrão
INSERT INTO content_types (name, slug, source, `schema`, plural_label, singular_label, default_fields)
VALUES
  (
    'Post', 'post', 'CORE', '{}',
    'Posts', 'Post',
    '["title","slug","content","excerpt","featured_image","seo_title","seo_description","status","author"]'
  ),
  (
    'Page', 'page', 'CORE', '{}',
    'Pages', 'Page',
    '["title","slug","content","excerpt","featured_image","seo_title","seo_description","status","author"]'
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  default_fields = VALUES(default_fields),
  updated_at = NOW();

-- +migrate Down
DELETE FROM content_types WHERE slug IN ('post', 'page') AND source = 'CORE';
