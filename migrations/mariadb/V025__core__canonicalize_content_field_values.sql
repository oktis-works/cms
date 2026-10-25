-- @okcms domain=core_schema provider=mariadb conflict_policy=block max_affected_rows=100000
-- +migrate Up
CREATE TABLE IF NOT EXISTS content_value_migration_conflicts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  content_id CHAR(36) NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL, sources JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(content_id, field_name)
);
UPDATE content SET body = JSON_MERGE_PATCH(COALESCE(data, JSON_OBJECT()), COALESCE(body, JSON_OBJECT())), data = JSON_OBJECT();
UPDATE content_versions SET body = COALESCE(body, JSON_OBJECT());
-- +migrate Down
DROP TABLE IF EXISTS content_value_migration_conflicts;
