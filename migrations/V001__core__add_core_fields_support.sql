-- +migrate Up
-- Core Fields Support: is_locked, is_core_field, core_field_key

-- field_definitions: campos de controle para core fields
ALTER TABLE field_definitions 
  ADD COLUMN IF NOT EXISTS is_core_field BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS core_field_key VARCHAR(100);

-- content_types: campos padrão por tipo de conteúdo
ALTER TABLE content_types 
  ADD COLUMN IF NOT EXISTS default_fields JSONB 
    NOT NULL DEFAULT '["title","slug","content","excerpt","featured_image",
                       "seo_title","seo_description","status","author"]'::jsonb;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_field_definitions_core 
  ON field_definitions(is_core_field) WHERE is_core_field = true;
CREATE INDEX IF NOT EXISTS idx_field_definitions_locked 
  ON field_definitions(is_locked) WHERE is_locked = true;
CREATE INDEX IF NOT EXISTS idx_field_definitions_core_key 
  ON field_definitions(core_field_key) WHERE core_field_key IS NOT NULL;

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