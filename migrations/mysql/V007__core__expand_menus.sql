-- @okcms domain=core_schema provider=mysql
-- WordPress-style menu settings and richer menu item metadata.
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS settings JSON NOT NULL DEFAULT '{}';
