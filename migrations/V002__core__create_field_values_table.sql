-- +migrate Up
-- Tabela de valores de campos (isolados por entidade)

CREATE TABLE IF NOT EXISTS field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_definition_id UUID NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('content', 'taxonomy_term')),
  entity_id UUID NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(field_definition_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_field_values_entity 
  ON field_values(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field 
  ON field_values(field_definition_id);
CREATE INDEX IF NOT EXISTS idx_field_values_updated 
  ON field_values(updated_at DESC);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_field_values_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_field_values_updated ON field_values;
CREATE TRIGGER trg_field_values_updated
  BEFORE UPDATE ON field_values
  FOR EACH ROW EXECUTE FUNCTION update_field_values_timestamp();

-- +migrate Down
DROP TRIGGER IF EXISTS trg_field_values_updated ON field_values;
DROP TABLE IF EXISTS field_values;