---
"@oktis-works/api": minor
---

New editor extension endpoints (parity E1–E8): GET /api/v1/plugins/extensions (merged manifest + runtime admin extension state with plugin namespacing and dedupe), GET /api/v1/blocks and GET /api/v1/patterns (editor-agnostic catalogs merging manifest declarations with runtime registrations — no tables, entries exist while plugins are active).
