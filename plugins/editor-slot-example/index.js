/**
 * editor-slot-example — minimal wiring for a plugin-built block editor.
 *
 * Demonstrates the extension points documented in PLUGIN.md (§12/§13/§14):
 *   1. Editor slot  — manifest `admin.editors[]` / `api.admin.addEditor`
 *   2. Block registry — manifest `blocks[]` / `api.registerBlock`
 *   3. Pattern registry — manifest `patterns[]` / `api.registerPattern`
 *   4. Document compilation — `before_save_content_<type>` filter (§13)
 *
 * The static declarations (one editor, one block, one pattern) live in
 * manifest.json. This file shows the dynamic equivalents plus the save-time
 * compilation hook. It is NOT a full editor — the catalog dedupes manifest
 * and runtime entries with the same namespaced id, so both paths coexist.
 */

export async function register(api) {
  // 1. Runtime editor registration (same effect as manifest admin.editors[]).
  //    mode 'below' renders under the classic body; 'replace-body' would take
  //    the body area over entirely.
  api.admin.addEditor({
    id: 'example-editor',
    label: 'Example Blocks',
    screens: ['*'],
    mode: 'below',
    componentId: 'editor-slot-example:ExampleEditor',
  });

  // 2. Runtime block registration (same effect as manifest blocks[]).
  //    Requires the blocks:register permission (declared in the manifest).
  api.registerBlock({
    type: 'example-note',
    label: 'Example Note',
    icon: 'sticky-note',
    category: 'example',
    adminComponentPath: 'editor-slot-example:ExampleNoteBlock',
  });

  // 3. Runtime pattern registration (same effect as manifest patterns[]).
  //    Bare names are namespaced as 'editor-slot-example/example-cta' by the
  //    GET /api/v1/patterns catalog.
  api.registerPattern({
    name: 'example-cta',
    label: 'Example CTA',
    content: '<a class="example-cta">Call to action</a>',
    screens: ['*'],
  });

  // 4. Save-time compilation (preferred path — PLUGIN.md §13): compile the
  //    editor document into body.content before the content row persists.
  //    The filter receives input.body and must return the new body.
  api.addFilter('before_save_content_post', (body) => {
    if (!body || typeof body !== 'object') return body;
    if (!body['_editor']) return body; // classic editing — nothing to compile
    // A real block editor serializes its document into HTML here, e.g.:
    //   return { ...body, content: blocksToHtml(body['_editor'].blocks) };
    return { ...body, content: body['content'] ?? '' };
  });
}
