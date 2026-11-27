-- @okcms domain=tenant_data provider=mariadb
-- +migrate Up
UPDATE settings AS legacy
LEFT JOIN settings AS current_setting
  ON ((current_setting.tenant_id = legacy.tenant_id) OR (current_setting.tenant_id IS NULL AND legacy.tenant_id IS NULL))
 AND current_setting.key = 'timezone_string'
SET legacy.key = 'timezone_string', legacy."group" = 'reading'
WHERE legacy.key = 'timezone'
  AND legacy."group" = 'general'
  AND current_setting.id IS NULL;

DELETE FROM settings WHERE key = 'timezone' AND "group" = 'general';

-- +migrate Down
UPDATE settings AS current_setting
LEFT JOIN settings AS legacy
  ON ((legacy.tenant_id = current_setting.tenant_id) OR (legacy.tenant_id IS NULL AND current_setting.tenant_id IS NULL))
 AND legacy.key = 'timezone'
SET current_setting.key = 'timezone', current_setting."group" = 'general'
WHERE current_setting.key = 'timezone_string'
  AND current_setting."group" = 'reading'
  AND legacy.id IS NULL;
