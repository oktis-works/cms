// @oktis-works/admin - Plugin Field Config Component
// Dynamic component loader for plugin field type configuration in custom fields editor
import { Show, createSignal, onMount } from 'solid-js';
export function PluginFieldConfig(props) {
    const [Component, setComponent] = createSignal(null);
    const [error, setError] = createSignal(null);
    const [loading, setLoading] = createSignal(true);
    onMount(async () => {
        try {
            // Dynamic import of the plugin's admin config component
            // The path format: @/plugins/{plugin-name}/admin/components/{ComponentName}.tsx
            const module = await import(props.adminComponentPath);
            const Comp = module.default || module.PluginFieldConfig || module[Object.keys(module)[0]];
            if (Comp) {
                setComponent(Comp);
            }
            else {
                setError('Componente de configuração não encontrado no módulo');
            }
        }
        catch (e) {
            setError(`Erro ao carregar componente: ${e instanceof Error ? e.message : String(e)}`);
        }
        finally {
            setLoading(false);
        }
    });
    const handleConfigChange = (newConfig) => {
        props.onChange({ config: newConfig });
    };
    if (loading) {
        return (<div class="fb-plugin-field-config fb-plugin-field-config--loading">
        <div class="fb-spinner" aria-hidden="true"></div>
        <span>Carregando configuração do plugin...</span>
      </div>);
    }
    if (error) {
        return (<div class="fb-plugin-field-config fb-plugin-field-config--error">
        <i data-lucide="alert-triangle" aria-hidden="true"></i>
        <div>
          <strong>Não foi possível carregar o componente de configuração</strong>
          <p class="muted">{error}</p>
          <details class="fb-fallback-config">
            <summary>Usar editor JSON bruto (fallback)</summary>
            <FallbackJsonEditor config={props.field.config} schema={props.configSchema} onChange={handleConfigChange}/>
          </details>
        </div>
      </div>);
    }
    if (!Component) {
        return (<div class="fb-plugin-field-config fb-plugin-field-config--error">
        <i data-lucide="alert-triangle" aria-hidden="true"></i>
        <div>
          <strong>Componente não exportado corretamente</strong>
          <p class="muted">O plugin deve exportar um componente padrão ou nomeado 'PluginFieldConfig'</p>
          <details class="fb-fallback-config">
            <summary>Usar editor JSON bruto (fallback)</summary>
            <FallbackJsonEditor config={props.field.config} schema={props.configSchema} onChange={handleConfigChange}/>
          </details>
        </div>
      </div>);
    }
    return (<div class="fb-plugin-field-config">
      <Component config={props.field.config} schema={props.configSchema} onChange={handleConfigChange} t={props.t}/>
    </div>);
}
// Fallback JSON editor when plugin component fails to load
function FallbackJsonEditor(props) {
    const [jsonText, setJsonText] = createSignal(JSON.stringify(props.config, null, 2));
    const [parseError, setParseError] = createSignal(null);
    const handleInput = (e) => {
        const value = e.target.value;
        setJsonText(value);
        try {
            JSON.parse(value);
            setParseError(null);
        }
        catch (e) {
            setParseError('JSON inválido');
        }
    };
    const handleBlur = () => {
        if (!parseError()) {
            try {
                const parsed = JSON.parse(jsonText());
                props.onChange(parsed);
            }
            catch {
                // ignore
            }
        }
    };
    return (<div class="fb-fallback-json-editor">
      <textarea class="input fb-json-textarea" value={jsonText()} onInput={handleInput} onBlur={handleBlur} placeholder="{}" spellcheck={false}/>
      <Show when={parseError()}>
        <p class="fb-error">{parseError()}</p>
      </Show>
      <Show when={props.schema}>
        <details>
          <summary>Ver JSON Schema</summary>
          <pre class="fb-schema-preview">{JSON.stringify(props.schema, null, 2)}</pre>
        </details>
      </Show>
    </div>);
}
//# sourceMappingURL=PluginFieldConfig.jsx.map