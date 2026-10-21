---
'@oktis-works/cli': patch
'@oktis-works/database': patch
---

Fix demo content seed issues

- Add unique constraint for content (tenant_id, type, slug) - V019 migration
- Fix seed demo content ON CONFLICT for users email and tenant_users
- Fix seed demo content ON CONFLICT for content (tenant_id, type, slug)
- Fix menus seed ON CONFLICT
- Fix reading settings ON CONFLICT