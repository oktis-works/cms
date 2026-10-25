-- @okcms domain=core_schema provider=mariadb conflict_policy=block max_affected_rows=100000
-- +migrate Up
ALTER TABLE content ADD CONSTRAINT uq_content_tenant_type_slug UNIQUE (tenant_id, type, slug);
-- +migrate Down
ALTER TABLE content DROP INDEX uq_content_tenant_type_slug;
