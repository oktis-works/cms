-- @okcms domain=core_schema provider=mysql
-- +migrate Up
-- Isolamento adicional para renderização pública de temas.
-- As tabelas já tinham RLS em instalações novas, mas bases antigas também
-- precisam de FORCE RLS e de políticas para as relações de taxonomia.

-- +migrate Down
