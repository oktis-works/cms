-- @okcms domain=core_schema provider=mariadb
-- +migrate Up
-- Core Fields Support: is_locked, is_core_field, core_field_key

-- field_definitions: campos de controle para core fields
ALTER TABLE field_definitions ADD COLUMN is_core_field BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS core_field_key VARCHAR(100);

-- content_types: campos padrão por tipo de conteúdo
ALTER TABLE content_types ADD COLUMN default_fields JSON
    NOT NULL DEFAULT '["title","slug","content","excerpt","featured_image",
                       "seo_title","seo_description","status","author"]';

-- Índices para performance
CREATE INDEX idx_field_definitions_core
  ON field_definitions(is_core_field);
CREATE INDEX idx_field_definitions_locked
  ON field_definitions(is_locked);
CREATE INDEX idx_field_definitions_core_key
  ON field_definitions(core_field_key);

-- +migrate Down
DROP INDEX IF EXISTS idx_field_definitions_core;
DROP INDEX IF EXISTS idx_field_definitions_locked;
DROP INDEX IF EXISTS idx_field_definitions_core_key;

ALTER TABLE field_definitions
  DROP COLUMN IF EXISTS is_core_field,
  DROP COLUMN IF EXISTS is_locked,
  DROP COLUMN IF EXISTS core_field_key;

ALTER TABLE content_types
  DROP COLUMN IF EXISTS default_fields;
