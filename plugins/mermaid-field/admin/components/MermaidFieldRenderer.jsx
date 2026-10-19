// @oktis-works/mermaid-field - Componente de renderização do campo Mermaid
// Usado no editor de conteúdo: /content/*/edit
import { createSignal, createEffect } from 'solid-js';
import mermaid from 'mermaid';
export default function MermaidFieldRenderer(props) {
    const { field, value, onChange, disabled, t } = props;
    const [svg, setSvg] = createSignal('');
    const [error, setError] = createSignal(null);
    const [rendered, setRendered] = createSignal(false);
    const [editorValue, setEditorValue] = createSignal(value ?? field.config?.diagramCode ?? '');
    // Configurações do campo
    const theme = field.config?.theme ?? 'default';
    const editable = field.config?.editable !== false;
    // Renderiza o diagrama quando o valor muda
    createEffect(() => {
        const code = editorValue();
        if (!code || !code.trim()) {
            setSvg('');
            setRendered(false);
            setError(null);
            return;
        }
        try {
            mermaid.initialize({
                theme,
                securityLevel: 'loose',
                startOnLoad: false,
                fontFamily: 'inherit',
            });
            const id = `mermaid-${field.name}-${Date.now()}`;
            const { svg: s } = mermaid.render(id, code);
            setSvg(s);
            setRendered(true);
            setError(null);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setRendered(false);
        }
    });
    const handleEditorChange = (e) => {
        const newValue = e.target.value;
        setEditorValue(newValue);
        if (onChange)
            onChange(newValue);
    };
    return (<div class="mermaid-field-renderer">
      <div class="mermaid-toolbar">
        <span class="mermaid-toolbar__label">
          {t('settings.customFields.mermaid.diagram') ?? 'Diagrama Mermaid'}
        </span>
        <div class="mermaid-toolbar__actions">
          <Show when={editable}>
            <button type="button" class="btn btn-sm btn-secondary" onClick={() => {
            // Copiar código para clipboard
            navigator.clipboard.writeText(editorValue());
        }} title={t('settings.customFields.mermaid.copyCode') ?? 'Copiar código'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button type="button" class="btn btn-sm btn-secondary" onClick={() => {
            // Re-renderizar forçado
            setEditorValue(editorValue() + '\n');
        }} title={t('settings.customFields.mermaid.rerender') ?? 'Re-renderizar'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </Show>
        </div>
      </div>

      <div class="mermaid-renderer__content">
        {error() ? (<div class="mermaid-error">
            <div class="mermaid-error__header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{t('settings.customFields.mermaid.renderError') ?? 'Erro ao renderizar'}</span>
            </div>
            <pre class="mermaid-error__details">{error()}</pre>
            {editable && (<textarea class="input mermaid-source-editor" value={editorValue()} onInput={handleEditorChange} disabled={disabled} rows={10} spellcheck={false} placeholder="graph TD\n  A --> B"/>)}
          </div>) : rendered() ? (<div class="mermaid-diagram" innerHTML={svg()}/>) : (<div class="mermaid-loading">
            <div class="spinner" aria-hidden="true"></div>
            <span>{t('settings.customFields.mermaid.rendering') ?? 'Renderizando diagrama...'}</span>
          </div>)}

        {editable && (<div class="mermaid-source-section">
            <Label>
              <input type="checkbox" checked={true} onChange={(e) => { }} class="mermaid-source-toggle"/>
              {t('settings.customFields.mermaid.showCode') ?? 'Mostrar código fonte'}
            </Label>
            <textarea class="input mermaid-source-editor" value={editorValue()} onInput={handleEditorChange} disabled={disabled} rows={8} spellcheck={false} placeholder="graph TD\n  A --> B"/>
          </div>)}
      </div>
    </div>);
}
//# sourceMappingURL=MermaidFieldRenderer.jsx.map