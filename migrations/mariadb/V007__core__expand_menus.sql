-- @okcms domain=core_schema provider=mariadb
-- WordPress-style menu settings and richer menu item metadata.
ALTER TABLE menus ADD COLUMN settings JSON NOT NULL DEFAULT '{}';
