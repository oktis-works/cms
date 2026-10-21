---
'@oktis-works/database': minor
'@oktis-works/cli': patch
---

Fix demo content seed issues

- Add unique constraint for menus (tenant_id, slug) - V020 migration
- Fix demo content seed to use CTE-based upserts instead of ON CONFLICT to avoid constraint caching issues with connection pooling
- Fix pages, posts, menus, and settings inserts to use CTE-based upserts (WITH upsert AS UPDATE ... INSERT ... WHERE NOT EXISTS)
- Fix menus table unique constraint (V020) for ON CONFLICT (tenant_id, slug)
- Fix content seed to use CTE-based upsert (WITH upsert AS UPDATE ... INSERT ... WHERE NOT EXISTS) to avoid constraint caching issues with connection pooling
- Fix tenant_users role lookup to accept global roles (tenant_id IS NULL)
- Fix user creation ON CONFLICT to properly handle existing users