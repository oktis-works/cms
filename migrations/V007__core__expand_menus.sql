-- WordPress-style menu settings and richer menu item metadata.
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
