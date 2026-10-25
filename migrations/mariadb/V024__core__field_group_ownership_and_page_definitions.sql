-- @okcms domain=core_schema provider=mariadb conflict_policy=block max_affected_rows=100000
-- +migrate Up
SELECT 1;
-- +migrate Down
