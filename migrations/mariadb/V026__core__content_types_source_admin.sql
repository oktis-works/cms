-- @okcms domain=core_schema provider=mariadb
-- +migrate Up
SELECT 1; -- MySQL: ALTER TABLE DROP CONSTRAINT IF EXISTS not supported; constraint may not exist
-- +migrate Down
