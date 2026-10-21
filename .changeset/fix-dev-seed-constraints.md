---
'@oktis-works/cli': minor
'@oktis-works/core': minor
'@oktis-works/database': minor
---

Fix dev command user creation flow and seed constraints

- CLI `okcms dev` now properly prompts for admin email/name/password when:
  - No users exist in database, OR
  - Existing user has invalid password hash (e.g., dummy hash from seed)
- Fixed seed demo content to use CTE-based upserts instead of ON CONFLICT to avoid constraint caching issues with connection pooling
- Added unique constraint for menus (tenant_id, slug) via V020 migration
- Fixed bcrypt hash validation regex to properly escape $ characters
- Updated dev command to use hooks for getFirstUser/isValidBcryptHash for better testability