-- @okcms domain=core_schema provider=mysql
-- +migrate Up
CREATE TABLE IF NOT EXISTS theme_config_versions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  theme_id CHAR(36) NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  config JSON NOT NULL, user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  change_summary TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- +migrate Down
