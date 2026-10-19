// @oktis-works/admin - Plugin Field Renderer Component
// Dynamic component loader for plugin field type rendering in content editor
import { Show, createSignal, onMount } from 'solid-js';
export function PluginFieldRenderer(props) {
    const [Component, setComponent] = createSignal(null);
    const [error, setError] = createSignal(null);
    const [loading, setLoading] = createSignal(true);
    const [triedRenderer, setTriedRenderer] = createSignal(false);
    onMount(async () => {
        // Try renderer path first, then fall back to config component path
        const pathsToTry = [
            props.adminRendererPath,
            props.adminComponentPath,
        ].filter(Boolean);
        for (const path of pathsToTry) {
            try {
                const module = await import(path);
                const Comp = module.default || module.PluginFieldRenderer || module.PluginFieldConfig || module[Object.keys(module)[0]];
                if (Comp) {
                    setComponent(Comp);
                    setLoading(false);
                    return;
                }
            }
            catch (e) {
                // Continue to next path
                console.debug(`[PluginFieldRenderer] Failed to load ${path}:`, e);
            }
        }
        // If we have a renderer path but it failed, try the config component as fallback
        if (props.adminRendererPath && !triedRenderer()) {
            setTriedRenderer(true);
            // The loop above already tried both, so we just set error
        }
        setError('Componente de renderização não encontrado');
        setLoading(false);
    });
    const handleValueChange = (newValue) => {
        props.onChange(newValue);
    };
    if (loading) {
        return (<div class="fb-plugin-field-renderer fb-plugin-field-renderer--loading">
        <div class="fb-spinner" aria-hidden="true"></div>
        <span>Carregando editor...</span>
      </div>);
    }
    if (error || !Component) {
        return (<div class="fb-plugin-field-renderer fb-plugin-field-renderer--fallback">
        <Show when={error()}>
          <div class="fb-renderer-error">
            <i data-lucide="alert-circle" aria-hidden="true"></i>
            <span>{error()}</span>
          </div>
        </Show>
        <FallbackRenderer field={props.field} value={props.value} onChange={handleValueChange} disabled={props.disabled} t={props.t}/>
      </div>);
    }
    return (<div class="fb-plugin-field-renderer">
      <Component field={props.field} value={props.value} onChange={handleValueChange} disabled={props.disabled} t={props.t}/>
    </div>);
}
// Fallback renderer - basic input based on field config
function FallbackRenderer(props) {
    const { field, value, onChange, disabled, t } = props;
    // Try to infer input type from config or use textarea as default
    const inputType = field.config?.inputType || 'textarea';
    const placeholder = field.config?.placeholder || '';
    const rows = field.config?.rows || 4;
    if (inputType === 'textarea' || inputType === 'code' || inputType === 'markdown') {
        return (<textarea class="input fb-plugin-fallback-textarea" value={value} onInput={(e) => onChange(e.currentTarget.value)} placeholder={placeholder} rows={rows} disabled={disabled} spellcheck={false}/>);
    }
    if (inputType === 'number') {
        return (<input type="number" class="input" value={value} onInput={(e) => onChange(Number(e.currentTarget.value) || 0)} placeholder={placeholder} disabled={disabled}/>);
    }
    // Default: text input
    return (<input type="text" class="input" value={value} onInput={(e) => onChange(e.currentTarget.value)} placeholder={placeholder} disabled={disabled}/>);
}
//# sourceMappingURL=PluginFieldRenderer.jsx.map