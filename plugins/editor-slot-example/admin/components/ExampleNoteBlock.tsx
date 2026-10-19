// @oktis-works/plugin example - Admin component for the example-note block
//
// Mounted by the plugin-built editor via the block catalog
// (GET /api/v1/blocks → adminComponentPath). A real block would render its
// attribute form (attrsSchema drives the inspector) — this example only
// proves the wiring: the editor can load and mount plugin block components.

export default function ExampleNoteBlock(props: Record<string, unknown>) {
  return (
    <div class="example-block" data-block="editor-slot-example/example-note">
      <strong>Example Note</strong>
      <p class="muted">Block wiring works. Attributes received: {Object.keys(props).join(', ') || 'none'}.</p>
    </div>
  );
}
