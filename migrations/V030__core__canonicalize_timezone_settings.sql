-- @okcms domain=tenant_data provider=postgres
-- +migrate Up
-- Move the legacy general.timezone key to the canonical reading timezone model.
UPDATE settings AS legacy
SET key = 'timezone_string', "group" = 'reading'
WHERE legacy.key = 'timezone'
  AND legacy."group" = 'general'
  AND NOT EXISTS (
    SELECT 1 FROM settings AS current_setting
    WHERE current_setting.tenant_id IS NOT DISTINCT FROM legacy.tenant_id
      AND current_setting.key = 'timezone_string'
  );

DELETE FROM settings
WHERE key = 'timezone' AND "group" = 'general';

-- +migrate Down
UPDATE settings
SET key = 'timezone', "group" = 'general'
WHERE key = 'timezone_string' AND "group" = 'reading'
  AND NOT EXISTS (
    SELECT 1 FROM settings AS legacy
    WHERE legacy.tenant_id IS NOT DISTINCT FROM settings.tenant_id
      AND legacy.key = 'timezone'
  );
