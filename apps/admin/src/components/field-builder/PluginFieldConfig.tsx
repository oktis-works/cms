// @oktis-works/admin - Plugin Field Config Component
// Dynamic component loader for plugin field type configuration in custom fields editor

import { Show, createSignal, onMount } from 'solid-js';

interface PluginFieldConfigProps {
  field: {
    config: Record<string, unknown>;
    type: string;
  };
  configSchema?: Record<string, unknown>;
  adminComponentPath: string;
  onChange: (patch: { config: Record<string, unknown> }) => void;
  t: (key: string) => string;
}

export function PluginFieldConfig(props: PluginFieldConfigProps) {
  const [Component, setComponent] = createSignal<any>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      // Dynamic import of the plugin's admin config component
      // The path format: @/plugins/{plugin-name}/admin/components/{ComponentName}.tsx
      const module = await import(props.adminComponentPath);
      const Comp = module.default || module.PluginFieldConfig || module[Object.keys(module)[0]];
      if (Comp) {
        setComponent(Comp);
      } else {
        setError('Componente de configuração não encontrado no módulo');
      }
    } catch (_e) {
      setError(`Erro ao carregar componente: ${_e instanceof Error ? _e.message : String(_e)}`);
    } finally {
      setLoading(false);
    }
  });

  const handleConfigChange = (newConfig: Record<string, unknown>) => {
    props.onChange({ config: newConfig });
  };

  if (loading) {
    return (
      <div class="fb-plugin-field-config fb-plugin-field-config--loading">
        <div class="fb-spinner" aria-hidden="true"></div>
        <span>Carregando configuração do plugin...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div class="fb-plugin-field-config fb-plugin-field-config--error">
        <i data-lucide="alert-triangle" aria-hidden="true"></i>
        <div>
          <strong>Não foi possível carregar o componente de configuração</strong>
          <p class="muted">{error}</p>
          <details class="fb-fallback-config">
            <summary>Usar editor JSON bruto (fallback)</summary>
            <FallbackJsonEditor
              config={props.field.config}
              schema={props.configSchema}
              onChange={handleConfigChange}
            />
          </details>
        </div>
      </div>
    );
  }

  if (!Component) {
    return (
      <div class="fb-plugin-field-config fb-plugin-field-config--error">
        <i data-lucide="alert-triangle" aria-hidden="true"></i>
        <div>
          <strong>Componente não exportado corretamente</strong>
          <p class="muted">O plugin deve exportar um componente padrão ou nomeado 'PluginFieldConfig'</p>
          <details class="fb-fallback-config">
            <summary>Usar editor JSON bruto (fallback)</summary>
            <FallbackJsonEditor
              config={props.field.config}
              schema={props.configSchema}
              onChange={handleConfigChange}
            />
          </details>
        </div>
      </div>
    );
  }

  return (
    <div class="fb-plugin-field-config">
      <Component
        config={props.field.config}
        schema={props.configSchema}
        onChange={handleConfigChange}
        t={props.t}
      />
    </div>
  );
}

// Fallback JSON editor when plugin component fails to load
function FallbackJsonEditor(props: {
  config: Record<string, unknown>;
  schema?: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const [jsonText, setJsonText] = createSignal(JSON.stringify(props.config, null, 2));
  const [parseError, setParseError] = createSignal<string | null>(null);

  const handleInput = (e: Event) => {
    const value = (e.target as HTMLTextAreaElement).value;
    setJsonText(value);
    try {
      JSON.parse(value);
      setParseError(null);
    } catch {
      setParseError('JSON inválido');
    }
  };

  const handleBlur = () => {
    if (!parseError()) {
      try {
        const parsed = JSON.parse(jsonText());
        props.onChange(parsed);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div class="fb-fallback-json-editor">
      <textarea
        class="input fb-json-textarea"
        value={jsonText()}
        onInput={handleInput}
        onBlur={handleBlur}
        placeholder="{}"
        spellcheck={false}
      />
      <Show when={parseError()}>
        <p class="fb-error">{parseError()}</p>
      </Show>
      <Show when={props.schema}>
        <details>
          <summary>Ver JSON Schema</summary>
          <pre class="fb-schema-preview">{JSON.stringify(props.schema, null, 2)}</pre>
        </details>
      </Show>
    </div>
  );
}