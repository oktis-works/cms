-- @okcms domain=core_schema provider=mariadb
-- +migrate Up
-- Tabela de valores de campos (isolados por entidade)

CREATE TABLE IF NOT EXISTS field_values (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  field_definition_id CHAR(36) NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('content', 'taxonomy_term')),
  entity_id CHAR(36) NOT NULL,
  value JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(field_definition_id, entity_type, entity_id)
);

CREATE INDEX idx_field_values_entity
  ON field_values(entity_type, entity_id);
CREATE INDEX idx_field_values_field
  ON field_values(field_definition_id);
CREATE INDEX idx_field_values_updated
  ON field_values(updated_at DESC);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS trg_field_values_updated;
CREATE TRIGGER trg_field_values_updated BEFORE UPDATE ON field_values FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;

-- +migrate Down
DROP TRIGGER IF EXISTS trg_field_values_updated;
DROP TABLE IF EXISTS field_values;
