---
"@oktis-works/admin": minor
---

Plugin admin UI slots and the editor slot (parity E1–E8): plugin components render via dynamic import (menu/submenu, dashboard widgets, meta boxes, list columns + renderers, action links) fed by GET /api/v1/plugins/extensions; ContentEditor activates plugin editors per screen (replace-body/below modes with the { editorId, contentType, contentId, body, setBody, disabled } contract); field builder supports the block location parameter.
