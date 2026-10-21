---
'@oktis-works/admin': minor
---

Fix ReadingSettings: add timezone_string and gmt_offset fields

- Added timezone_string (IANA format) and gmt_offset fields to ReadingSettings
- Updated submit to save timezone_string and gmt_offset
- Added missing i18n keys for gmtOffsetDescription (en/pt-BR)
- Fixed form to save all reading settings including timezone