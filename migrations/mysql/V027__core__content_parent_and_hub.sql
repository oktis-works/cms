-- @okcms domain=core_schema provider=mysql
-- +migrate Up
SELECT 1; -- MySQL: schema already includes parent_id, url_redirects table, and indexes
-- +migrate Down
