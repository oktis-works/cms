# editor-slot-example

Minimal wiring example for a plugin-built block editor (WordPress-parity
phase E8). It demonstrates every extension point the platform opens for
editor plugins — **it is not a full editor**.

## What it wires

| Surface | Manifest (static) | Runtime (`index.js`) |
|---------|-------------------|----------------------|
| Editor slot | `admin.editors[]` (`below` mode) | `api.admin.addEditor()` |
| Block registry | `blocks[]` (`example-note`) | `api.registerBlock()` |
| Pattern registry | `patterns[]` (`example-cta`) | `api.registerPattern()` |
| Save-time compilation | — | `api.addFilter('before_save_content_post', ...)` |

Manifest and runtime entries share namespaced ids, and the catalogs
(`GET /api/v1/plugins/extensions`, `GET /api/v1/blocks`,
`GET /api/v1/patterns`) dedupe them — both declaration paths coexist.

## Files

- `manifest.json` — static declarations (`manifestVersion: 2`)
- `index.js` — runtime registrations + the save-time compilation hook
- `admin/components/ExampleEditor.tsx` — editor slot component (edits
  `body.content` through the `setBody` contract)
- `admin/components/ExampleNoteBlock.tsx` — block component mounted by a
  plugin-built editor via the block catalog

## Permissions

`blocks:register`, `patterns:register`, `admin:ui`.

## Documentation

See `PLUGIN.md` §12 (admin slots/editor slot), §12.6 (body storage
conventions), §13 (render & save hooks) and §14 (building a block editor
as a plugin).
