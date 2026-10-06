-- +migrate Up
-- Locale preferido do usuário (i18n do admin: /api/v1/users/me/locale)
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(10);

-- +migrate Down
ALTER TABLE users DROP COLUMN IF EXISTS locale;
