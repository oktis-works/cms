-- @okcms domain=core_schema provider=mysql
-- +migrate Up
ALTER TABLE themes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE themes ADD COLUMN IF NOT EXISTS active_scope CHAR(36);
CREATE UNIQUE INDEX idx_themes_name_unique ON themes(name);
CREATE UNIQUE INDEX idx_themes_single_active ON themes(active_scope);
CREATE TRIGGER themes_active_scope_insert BEFORE INSERT ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', IFNULL(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'), NULL);
CREATE TRIGGER themes_active_scope_update BEFORE UPDATE ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', IFNULL(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'), NULL);
-- +migrate Down
