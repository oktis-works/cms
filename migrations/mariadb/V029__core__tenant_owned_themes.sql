-- @okcms domain=core_schema provider=mariadb
-- +migrate Up
-- Themes are tenant-owned. Existing global rows are assigned to the default tenant.
INSERT IGNORE INTO tenants (id, name, slug)
VALUES (UUID(), 'Default', 'default')
;

UPDATE themes t
JOIN tenants tenant ON tenant.slug = 'default'
SET t.tenant_id = tenant.id
WHERE t.tenant_id IS NULL;

ALTER TABLE themes MODIFY tenant_id CHAR(36) NOT NULL;
DROP INDEX idx_themes_name_unique ON themes;
CREATE UNIQUE INDEX idx_themes_name_unique ON themes(tenant_id, name);
DROP INDEX idx_themes_single_active ON themes;
UPDATE themes SET active_scope = IF(status = 'ACTIVE', tenant_id, NULL);
CREATE UNIQUE INDEX idx_themes_single_active ON themes(active_scope);
DROP TRIGGER IF EXISTS themes_active_scope_insert;
DROP TRIGGER IF EXISTS themes_active_scope_update;
CREATE TRIGGER themes_active_scope_insert BEFORE INSERT ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', NEW.tenant_id, NULL);
CREATE TRIGGER themes_active_scope_update BEFORE UPDATE ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', NEW.tenant_id, NULL);

-- +migrate Down
DROP TRIGGER IF EXISTS themes_active_scope_insert;
DROP TRIGGER IF EXISTS themes_active_scope_update;
DROP INDEX idx_themes_single_active ON themes;
DROP INDEX idx_themes_name_unique ON themes;
CREATE UNIQUE INDEX idx_themes_name_unique ON themes(name);
CREATE UNIQUE INDEX idx_themes_single_active ON themes(active_scope);
ALTER TABLE themes MODIFY tenant_id CHAR(36) NULL;
