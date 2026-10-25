-- @okcms domain=core_schema provider=mysql conflict_policy=report max_affected_rows=100000
-- +migrate Up
UPDATE content SET body = JSON_UNQUOTE(body) WHERE JSON_TYPE(body) = 'STRING';
-- +migrate Down
