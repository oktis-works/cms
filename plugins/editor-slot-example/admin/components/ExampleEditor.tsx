// @oktis-works/plugin example - Editor slot component (mode: below)
//
// Receives the editor slot contract from ContentEditor (PLUGIN.md §12.5).
// This example edits body.content directly with a plain textarea — a real
// block editor would render its document canvas here and serialize to HTML
// via setBody (see PLUGIN.md §14).

import { Show } from 'solid-js';

export default function ExampleEditor(props: {
  editorId: string;
  contentType: string;
  contentId: string;
  body: string;
  setBody: (html: string) => void;
  disabled: boolean;
}) {
  return (
    <div class="example-editor" data-editor-id={props.editorId}>
      <p class="muted">
        editor-slot-example · {props.contentType}
        <Show when={props.contentId}> · {props.contentId}</Show>
      </p>
      <textarea
        class="input"
        rows={10}
        disabled={props.disabled}
        placeholder="body.content (HTML)"
        value={props.body}
        onInput={(event) => props.setBody(event.currentTarget.value)}
      />
    </div>
  );
}
