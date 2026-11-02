// @oktis-works/admin - Plugin Field Renderer Component
// Uses Web Worker sandbox for plugin field type rendering in content editor

import { Show, Switch, Match, createSignal, onMount } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { loadPluginComponent } from '../ext/slots';
import { PluginWorkerHost } from '../components/PluginWorkerHost';

interface PluginFieldRendererProps {
  field: {
    type: string;
    name: string;
    label: string;
    config: Record<string, unknown>;
    required: boolean;
    instructions?: string;
  };
  value: unknown;
  onChange: (value: unknown) => void;
  adminRendererPath?: string;
  adminComponentPath?: string;
  disabled?: boolean;
  _t: (key: string) => string;
}

export function PluginFieldRenderer(props: PluginFieldRendererProps) {
  const [Component] = createSignal<any>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [useWorker, setUseWorker] = createSignal(false);
  const [workerPath, setWorkerPath] = createSignal<string>('');
  const [triedRenderer, setTriedRenderer] = createSignal(false);

  onMount(async () => {
    // Try renderer path first, then fall back to config component path
    const pathsToTry = [
      props.adminRendererPath,
      props.adminComponentPath,
    ].filter(Boolean) as string[];

    for (const path of pathsToTry) {
      try {
        const module = await loadPluginComponent(path);
        const Comp = module['default'] || module['PluginFieldRenderer'] || module['PluginFieldConfig'];
        if (Comp) {
          // Check if plugin declares sandbox support in manifest
          // For now, use worker for all plugin components for security
          setUseWorker(true);
          setWorkerPath(path);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.debug(`[PluginFieldRenderer] Failed to load ${path}:`, e);
      }
    }

    if (props.adminRendererPath && !triedRenderer()) {
      setTriedRenderer(true);
    }

    setError('Componente de renderização não encontrado');
    setLoading(false);
  });

  const handleValueChange = (newValue: unknown) => {
    props.onChange(newValue);
  };

  const fallback = () => (
    <FallbackRenderer
      field={props.field}
      value={props.value}
      onChange={handleValueChange}
      disabled={props.disabled}
      t={props._t}
    />
  );

  return (
    <Switch>
      <Match when={loading()}>
        <div class="fb-plugin-field-renderer fb-plugin-field-renderer--loading">
          <div class="fb-spinner" aria-hidden="true"></div>
          <span>Carregando editor...</span>
        </div>
      </Match>
      <Match when={error() || (!Component() && !useWorker())}>
        <div class="fb-plugin-field-renderer fb-plugin-field-renderer--fallback">
          <Show when={error()}>
            <div class="fb-renderer-error">
              <i data-lucide="alert-circle" aria-hidden="true"></i>
              <span>{error()}</span>
            </div>
          </Show>
          {fallback()}
        </div>
      </Match>
      <Match when={useWorker()}>
        <div class="fb-plugin-field-renderer">
          <PluginWorkerHost
            componentPath={workerPath()}
            mode="renderer"
            props={{
              field: props.field,
              value: props.value,
              onChange: handleValueChange,
              disabled: props.disabled,
              t: props._t,
            }}
            fallback={fallback}
          />
        </div>
      </Match>
      <Match when={true}>
        <div class="fb-plugin-field-renderer">
          <Dynamic
            component={Component()}
            field={props.field}
            value={props.value}
            onChange={handleValueChange}
            disabled={props.disabled}
            t={props._t}
          />
        </div>
      </Match>
    </Switch>
  );
}

// Fallback renderer - basic input based on field config
function FallbackRenderer(props: {
  field: PluginFieldRendererProps['field'];
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  t: (key: string) => string;
}) {
  const { field, value, onChange, disabled } = props;

  // Try to infer input type from config or use textarea as default
  const inputType = (field.config?.['inputType'] as string) || 'textarea';
  const placeholder = (field.config?.['placeholder'] as string) || '';
  const rows = (field.config?.['rows'] as number) || 4;

  if (inputType === 'textarea' || inputType === 'code' || inputType === 'markdown') {
    return (
      <textarea
        class="input fb-plugin-fallback-textarea"
        value={value as string}
        onInput={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        spellcheck={false}
      />
    );
  }

  if (inputType === 'number') {
    return (
      <input
        type="number"
        class="input"
        value={value as string | number}
        onInput={(e) => {
          const raw = e.currentTarget.value;
          if (raw === '') onChange('');
          else {
            const parsed = Number(raw);
            onChange(Number.isFinite(parsed) ? parsed : raw);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  }

  // Default: text input
  return (
    <input
      type="text"
      class="input"
      value={value as string}
      onInput={(e) => onChange(e.currentTarget.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
