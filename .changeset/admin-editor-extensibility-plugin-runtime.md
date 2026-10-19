---
"@oktis-works/plugin-runtime": minor
---

Runtime support for plugin admin UI and editor extension points (parity E1–E8): manifest v2 validation for admin.editors[] and patterns[]; api.registerBlock/api.registerPattern with permission checks and duplicate rejection exposed via internal.getBlocks/getPatterns; per-scope collectors getLoadedPluginBlocks/getLoadedPluginPatterns alongside getLoadedPluginAdminExtensions; fix for the platform scope key ('' → 'platform') that emptied platform-scoped lookups.
