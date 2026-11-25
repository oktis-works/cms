// @oktis-works/mermaid-field - Mermaid field renderer component

import { Show, createEffect, createSignal } from 'solid-js';
import mermaid from 'mermaid';

type Translator = (key: string) => string;

interface MermaidFieldRendererProps {
  field: {
    name: string;
    config?: Record<string, unknown>;
  };
  value?: unknown;
  onChange?: (value: string) => void;
  disabled?: boolean;
  t?: Translator;
  _t?: Translator;
}

let renderSequence = 0;

export default function MermaidFieldRenderer(props: MermaidFieldRendererProps) {
  const translate = (key: string, fallback: string): string =>
    props.t?.(key) ?? props._t?.(key) ?? fallback;
  const fieldConfig = props.field.config ?? {};
  const theme = String(fieldConfig['theme'] ?? 'default');
  const editable = fieldConfig['editable'] !== false;

  const [svg, setSvg] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [rendered, setRendered] = createSignal(false);
  const [showSource, setShowSource] = createSignal(true);
  const [editorValue, setEditorValue] = createSignal(
    String(props.value ?? fieldConfig['diagramCode'] ?? '')
  );
  const [rerenderToken, setRerenderToken] = createSignal(0);

  createEffect(() => {
    const incoming = props.value;
    if (incoming !== undefined && String(incoming) !== editorValue()) {
      setEditorValue(String(incoming));
    }
  });

  createEffect(() => {
    const code = editorValue();
    rerenderToken();
    void renderDiagram(code);
  });

  async function renderDiagram(code: string): Promise<void> {
    const request = ++renderSequence;
    setError(null);
    setRendered(false);
    setSvg('');

    if (!code.trim()) return;

    try {
      mermaid.initialize({
        theme,
        securityLevel: 'strict',
        startOnLoad: false,
        fontFamily: 'inherit',
      });
      const result = await mermaid.render(
        `mermaid-${props.field.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-${request}`,
        code
      );
      if (request !== renderSequence) return;
      setSvg(result.svg);
      setRendered(true);
    } catch (cause) {
      if (request !== renderSequence) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const handleEditorChange = (
    event: InputEvent & { currentTarget: HTMLTextAreaElement }
  ): void => {
    const nextValue = event.currentTarget.value;
    setEditorValue(nextValue);
    props.onChange?.(nextValue);
  };

  return (
    <div class="mermaid-field-renderer">
      <div class="mermaid-toolbar">
        <span class="mermaid-toolbar__label">
          {translate('settings.customFields.mermaid.diagram', 'Mermaid diagram')}
        </span>
        <Show when={editable}>
          <div class="mermaid-toolbar__actions">
            <button
              type="button"
              class="btn btn-sm btn-secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(editorValue());
              }}
              title={translate('settings.customFields.mermaid.copyCode', 'Copy code')}
            >
              Copy
            </button>
            <button
              type="button"
              class="btn btn-sm btn-secondary"
              onClick={() => setRerenderToken((token) => token + 1)}
              title={translate('settings.customFields.mermaid.rerender', 'Render again')}
            >
              Render again
            </button>
          </div>
        </Show>
      </div>

      <div class="mermaid-renderer__content">
        <Show
          when={error()}
          fallback={
            <Show
              when={rendered()}
              fallback={
                <div class="mermaid-loading">
                  <span>
                    {editorValue().trim()
                      ? translate('settings.customFields.mermaid.rendering', 'Rendering diagram…')
                      : translate(
                          'settings.customFields.mermaid.empty',
                          'Enter Mermaid code to render a diagram.'
                        )}
                  </span>
                </div>
              }
            >
              <div class="mermaid-diagram" innerHTML={svg()} />
            </Show>
          }
        >
          <div class="mermaid-error">
            <strong>{translate('settings.customFields.mermaid.renderError', 'Rendering failed')}</strong>
            <pre class="mermaid-error__details">{error()}</pre>
          </div>
        </Show>

        <Show when={editable}>
          <label class="mermaid-source-toggle">
            <input
              type="checkbox"
              checked={showSource()}
              onChange={(event) => setShowSource(event.currentTarget.checked)}
            />
            {translate('settings.customFields.mermaid.showCode', 'Show source code')}
          </label>
          <Show when={showSource()}>
            <textarea
              class="input mermaid-source-editor"
              value={editorValue()}
              onInput={handleEditorChange}
              disabled={props.disabled}
              rows={8}
              spellcheck={false}
              placeholder={'graph TD\n  A --> B'}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
}
