-- @okcms domain=core_schema provider=mysql conflict_policy=block max_affected_rows=100000
-- +migrate Up
ALTER TABLE menus ADD CONSTRAINT uq_menus_tenant_slug UNIQUE (tenant_id, slug);
-- +migrate Down
ALTER TABLE menus DROP INDEX uq_menus_tenant_slug;
