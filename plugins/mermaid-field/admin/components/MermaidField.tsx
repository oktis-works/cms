// @oktis-works/mermaid-field - Mermaid field configuration component

type Translator = (key: string) => string;

interface MermaidFieldConfigProps {
  config?: Record<string, unknown>;
  onChange?: (patch: { config: Record<string, unknown> }) => void;
  t?: Translator;
  _t?: Translator;
}

export default function MermaidFieldConfig(props: MermaidFieldConfigProps) {
  const config = props.config ?? {};
  const translate = (key: string, fallback: string): string =>
    props.t?.(key) ?? props._t?.(key) ?? fallback;

  const theme = String(config['theme'] ?? 'default');
  const editable = config['editable'] !== false;
  const diagramCode = String(
    config['diagramCode'] ??
      'graph TD\n  A[Start] --> B[Process]\n  B --> C[End]'
  );

  const emitChange = (patch: Record<string, unknown>): void => {
    props.onChange?.({
      config: {
        theme,
        editable,
        diagramCode,
        ...patch,
      },
    });
  };

  return (
    <div class="card mermaid-field-config">
      <div class="config-section">
        <h4>{translate('settings.customFields.mermaid.diagramSettings', 'Diagram settings')}</h4>

        <div class="config-row">
          <label for="mermaid-theme">
            {translate('settings.customFields.mermaid.theme', 'Theme')}
          </label>
          <select
            id="mermaid-theme"
            class="input"
            value={theme}
            onChange={(event) => emitChange({ theme: event.currentTarget.value })}
          >
            <option value="default">Default</option>
            <option value="dark">Dark</option>
            <option value="forest">Forest</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>

        <label class="fb-switch">
          <input
            type="checkbox"
            checked={editable}
            onChange={(event) => emitChange({ editable: event.currentTarget.checked })}
          />
          <span>
            {translate(
              'settings.customFields.mermaid.editable',
              'Allow editing the diagram in the content editor'
            )}
          </span>
        </label>
      </div>

      <div class="config-section">
        <label for="mermaid-default-code">
          {translate('settings.customFields.mermaid.defaultCode', 'Default Mermaid code')}
        </label>
        <p class="muted">
          {translate(
            'settings.customFields.mermaid.defaultCodeHint',
            'Initial code used when this field is added to content.'
          )}
        </p>
        <textarea
          id="mermaid-default-code"
          class="input mermaid-code-editor"
          value={diagramCode}
          onInput={(event) => emitChange({ diagramCode: event.currentTarget.value })}
          rows={12}
          placeholder={'graph TD\n  A[Start] --> B[Process]\n  B --> C[End]'}
          spellcheck={false}
        />
        <details class="mermaid-examples">
          <summary>{translate('settings.customFields.mermaid.examples', 'Examples')}</summary>
          <div class="example-buttons">
            <button
              type="button"
              class="btn btn-sm"
              onClick={() =>
                emitChange({
                  diagramCode:
                    'graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action 1]\n  B -->|No| D[Action 2]\n  C --> E[End]\n  D --> E',
                })
              }
            >
              {translate('settings.customFields.mermaid.exampleFlowchart', 'Flowchart')}
            </button>
            <button
              type="button"
              class="btn btn-sm"
              onClick={() =>
                emitChange({
                  diagramCode:
                    'sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello Bob!\n  B-->>A: Hi Alice!',
                })
              }
            >
              {translate('settings.customFields.mermaid.exampleSequence', 'Sequence')}
            </button>
            <button
              type="button"
              class="btn btn-sm"
              onClick={() =>
                emitChange({
                  diagramCode:
                    'classDiagram\n  class Animal {\n    +String name\n    +int age\n    +makeSound()\n  }\n  class Dog {\n    +String breed\n    +bark()\n  }\n  Animal <|-- Dog',
                })
              }
            >
              {translate('settings.customFields.mermaid.exampleClass', 'Classes')}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
