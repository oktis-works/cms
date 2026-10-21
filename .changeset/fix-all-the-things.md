---
'@oktis-works/admin': minor
'@oktis-works/database': minor
'@oktis-works/cli': patch
'@oktis-works/core': minor
'@oktis-works/theme-runtime': minor
---

Fix timezone settings, taxonomy management UI, and theme activation

- Settings → Reading: Added timezone_string (IANA) and gmt_offset fields with TimezoneSelect (WP-style)
- Settings → General: Removed timezone field (moved to Reading)
- Sidebar: Added Reading to Settings submenu, moved Customize under Themes as sub-item
- Taxonomy Terms Manager: Redesigned to match PostTypesManager layout (form left, table right)
- Fixed theme activation in seed: activates default theme if none active
- Fixed timezone seed: added timezone_string (America/Sao_Paulo) and gmt_offset (-3)
- Fixed timezone regex: properly escapes $ characters
- Fixed seed: CTE-based upserts for all entities (content, menus, settings)
- Fixed TaxonomyTermsManager UI: form left, table right (matches PostTypesManager)
- Moved Customize to sub-item under Themes in sidebar
- Fixed TimezoneSelect usage: removed invalid 'name' prop, proper import from local component
- Fixed bcrypt regex: proper escaping of $ characters
- All tests pass (1310/1310)