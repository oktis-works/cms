-- @okcms domain=core_schema provider=mysql
-- V017__core__lazy_field_types.sql
-- WordPress-parity item 25: lazy field types (lazy:true defers registry sync
-- until first use — GET /api/v1/field-types).

ALTER TABLE field_type_extensions ADD COLUMN lazy BOOLEAN NOT NULL DEFAULT false;
