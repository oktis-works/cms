// @oktis-works/admin - Plugin Field Config Component
// Uses Web Worker sandbox for plugin field type configuration in custom fields editor

import { Show, Switch, Match, createSignal, onMount } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { loadPluginComponent } from '../../ext/slots';
import { PluginWorkerHost } from '../PluginWorkerHost';

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
  const [Component] = createSignal<any>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [useWorker, setUseWorker] = createSignal(false);

  onMount(async () => {
    try {
      const module = await loadPluginComponent(props.adminComponentPath);
      const Comp = module['default'] || module['PluginFieldConfig'];
      if (Comp) {
        // Use worker sandbox for all plugin components for security
        setUseWorker(true);
        setLoading(false);
        return;
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

  const fallback = () => (
    <FallbackJsonEditor
      config={props.field.config}
      schema={props.configSchema}
      onChange={handleConfigChange}
    />
  );

  return (
    <Switch>
      <Match when={loading()}>
        <div class="fb-plugin-field-config fb-plugin-field-config--loading">
          <div class="fb-spinner" aria-hidden="true"></div>
          <span>Carregando configuração do plugin...</span>
        </div>
      </Match>
      <Match when={error() || !useWorker()}>
        <div class="fb-plugin-field-config fb-plugin-field-config--error">
          <i data-lucide="alert-triangle" aria-hidden="true"></i>
          <div>
            <strong>Não foi possível carregar o componente de configuração</strong>
            <p class="muted">{error() ?? 'Componente não exportado corretamente'}</p>
            <details class="fb-fallback-config">
              <summary>Usar editor JSON bruto (fallback)</summary>
              {fallback()}
            </details>
          </div>
        </div>
      </Match>
      <Match when={useWorker()}>
        <div class="fb-plugin-field-config">
          <PluginWorkerHost
            componentPath={props.adminComponentPath}
            mode="config"
            props={{
              config: props.field.config,
              schema: props.configSchema,
              onChange: handleConfigChange,
              t: props.t,
            }}
            fallback={fallback}
          />
        </div>
      </Match>
      <Match when={true}>
        <div class="fb-plugin-field-config">
          <Dynamic
            component={Component()}
            config={props.field.config}
            schema={props.configSchema}
            onChange={handleConfigChange}
            t={props.t}
          />
        </div>
      </Match>
    </Switch>
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
      setParseError('Invalid JSON');
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
          <summary>View JSON Schema</summary>
          <pre class="fb-schema-preview">{JSON.stringify(props.schema, null, 2)}</pre>
        </details>
      </Show>
    </div>
  );
}
