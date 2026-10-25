// @oktis-works/admin - Rich Text Editor
//
// Componente reutilizável para editor de texto rico (WYSIWYG).
// Usado pelo ContentEditor (editor clássico) e pelo campo wysiwyg do ThemeCustomizer.

import { createSignal, onMount, onCleanup } from 'solid-js';
import { sanitizeHtml } from '../../lib/sanitize';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  toolbarConfig?: ToolbarConfig;
}

export interface ToolbarConfig {
  formatBlock?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeThrough?: boolean;
  blockquote?: boolean;
  code?: boolean;
  unorderedList?: boolean;
  orderedList?: boolean;
  link?: boolean;
  unlink?: boolean;
  undo?: boolean;
  redo?: boolean;
  removeFormat?: boolean;
}

const DEFAULT_TOOLBAR: Required<ToolbarConfig> = {
  formatBlock: true,
  bold: true,
  italic: true,
  underline: true,
  strikeThrough: true,
  blockquote: true,
  code: true,
  unorderedList: true,
  orderedList: true,
  link: true,
  unlink: true,
  undo: true,
  redo: true,
  removeFormat: true,
};

const FORMAT_BLOCK_OPTIONS = [
  { value: '', label: 'Parágrafo' },
  { value: '<h1>', label: 'Título 1' },
  { value: '<h2>', label: 'Título 2' },
  { value: '<h3>', label: 'Título 3' },
  { value: '<h4>', label: 'Título 4' },
  { value: '<blockquote>', label: 'Bloco de citação' },
  { value: '<pre>', label: 'Código' },
];

export function RichTextEditor(props: RichTextEditorProps) {
  const {
    value,
    onChange,
    placeholder = 'Comece a escrever...',
    disabled = false,
    toolbarConfig = {},
  } = props;

  const toolbar = { ...DEFAULT_TOOLBAR, ...toolbarConfig };
  const [editorRef, setEditorRef] = createSignal<HTMLDivElement | null>(null);
  const [isComposing, setIsComposing] = createSignal(false);

  // Sync value to editor on external changes
  onMount(() => {
    const editor = editorRef();
    if (editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  });

  const formatBlock = (block: string): void => {
    if (!block) return;
    document.execCommand('formatBlock', false, block);
    triggerChange();
  };

  const formatInline = (command: string): void => {
    document.execCommand(command, false);
    triggerChange();
  };

  const createLink = (): void => {
    const url = window.prompt('Digite a URL:');
    if (url) {
      document.execCommand('createLink', false, url);
      triggerChange();
    }
  };

  const removeFormat = (): void => {
    document.execCommand('removeFormat', false);
    triggerChange();
  };

  const triggerChange = () => {
    const editor = editorRef();
    if (editor) {
      const html = editor.innerHTML;
      onChange(html);
    }
  };

  const handleInput = () => {
    if (!isComposing()) triggerChange();
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => {
    setIsComposing(false);
    triggerChange();
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
    triggerChange();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd + shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          formatInline('bold');
          break;
        case 'i':
          e.preventDefault();
          formatInline('italic');
          break;
        case 'u':
          e.preventDefault();
          formatInline('underline');
          break;
        case 'k':
          e.preventDefault();
          createLink();
          break;
        case 'z':
          e.preventDefault();
          document.execCommand('undo', false);
          triggerChange();
          break;
        case 'y':
          e.preventDefault();
          document.execCommand('redo', false);
          triggerChange();
          break;
      }
    }
  };

  return (
    <div class="rich-text-editor" data-rich-text-editor>
      <div class="rich-text-editor__toolbar" role="toolbar" aria-label={toolbar.formatBlock ? 'Editor de texto rico' : ''}>
        {toolbar.formatBlock && (
          <select
            class="rich-text-editor__select"
            aria-label={toolbar.formatBlock ? 'Formato de bloco' : ''}
            onChange={(e) => formatBlock(e.currentTarget.value)}
            value=""
            disabled={disabled}
          >
            {FORMAT_BLOCK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        {toolbar.formatBlock && <span class="rich-text-editor__divider" />}

        {toolbar.bold && (
          <button type="button" onClick={() => formatInline('bold')} disabled={disabled} aria-label="Negrito (Ctrl+B)">
            <strong>B</strong>
          </button>
        )}
        {toolbar.italic && (
          <button type="button" onClick={() => formatInline('italic')} disabled={disabled} aria-label="Itálico (Ctrl+I)">
            <em>I</em>
          </button>
        )}
        {toolbar.underline && (
          <button type="button" onClick={() => formatInline('underline')} disabled={disabled} aria-label="Sublinhado (Ctrl+U)">
            <u>U</u>
          </button>
        )}
        {toolbar.strikeThrough && (
          <button type="button" onClick={() => formatInline('strikeThrough')} disabled={disabled} aria-label="Tachado">
            <s>S</s>
          </button>
        )}

        {(toolbar.bold || toolbar.italic || toolbar.underline || toolbar.strikeThrough) && <span class="rich-text-editor__divider" />}

        {toolbar.blockquote && (
          <button type="button" onClick={() => formatBlock('<blockquote>')} disabled={disabled} aria-label="Bloco de citação">
            ❝
          </button>
        )}
        {toolbar.code && (
          <button type="button" onClick={() => formatBlock('<pre>')} disabled={disabled} aria-label="Código">
            {`<pre>`}
          </button>
        )}

        {(toolbar.blockquote || toolbar.code) && <span class="rich-text-editor__divider" />}

        {toolbar.unorderedList && (
          <button type="button" onClick={() => formatInline('insertUnorderedList')} disabled={disabled} aria-label="Lista com marcadores">
            • Lista
          </button>
        )}
        {toolbar.orderedList && (
          <button type="button" onClick={() => formatInline('insertOrderedList')} disabled={disabled} aria-label="Lista numerada">
            1. Lista
          </button>
        )}

        {(toolbar.unorderedList || toolbar.orderedList) && <span class="rich-text-editor__divider" />}

        {toolbar.link && (
          <button type="button" onClick={createLink} disabled={disabled} aria-label="Inserir link (Ctrl+K)">
            🔗
          </button>
        )}
        {toolbar.unlink && (
          <button type="button" onClick={() => formatInline('unlink')} disabled={disabled} aria-label="Remover link">
            🔗✕
          </button>
        )}

        {(toolbar.link || toolbar.unlink) && <span class="rich-text-editor__divider" />}

        {toolbar.undo && (
          <button type="button" onClick={() => { document.execCommand('undo', false); triggerChange(); }} disabled={disabled} aria-label="Desfazer (Ctrl+Z)">
            ↶
          </button>
        )}
        {toolbar.redo && (
          <button type="button" onClick={() => { document.execCommand('redo', false); triggerChange(); }} disabled={disabled} aria-label="Refazer (Ctrl+Y)">
            ↷
          </button>
        )}
        {toolbar.removeFormat && (
          <button type="button" onClick={removeFormat} disabled={disabled} aria-label="Limpar formatação">
            𝑥
          </button>
        )}
      </div>

      <div
        ref={setEditorRef}
        class="rich-text-editor__body"
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        innerHTML={value}
        onInput={handleInput}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        spellcheck={true}
      />

      <style>{`
        .rich-text-editor {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-white);
          overflow: hidden;
        }
        .rich-text-editor__toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.25rem;
          background: #f5f5f5;
          border-bottom: 1px solid var(--color-border);
          padding: 0.5rem;
        }
        .rich-text-editor__toolbar select.input {
          max-width: 160px;
          padding: 0.25rem 0.45rem;
        }
        .rich-text-editor__divider { width: 1px; height: 1.5rem; background: var(--color-border); margin: 0 0.25rem; }
        .rich-text-editor__toolbar button {
          min-width: 2rem;
          min-height: 2rem;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--color-text);
          padding: 0.25rem 0.45rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
        }
        .rich-text-editor__toolbar button:hover:not(:disabled) { border-color: var(--color-border); background: var(--color-white); }
        .rich-text-editor__toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
        .rich-text-editor__divider { width: 1px; height: 1.5rem; background: var(--color-border); margin: 0 0.25rem; }
        .rich-text-editor__body {
          min-height: 200px;
          border: 1px solid var(--color-border);
          border-top: 0;
          background: var(--color-white);
          color: var(--color-text);
          font-size: 0.9375rem;
          line-height: 1.6;
          padding: 0.75rem;
          outline: none;
          border-radius: 0 0 var(--radius-sm) var(--radius-sm);
        }
        .rich-text-editor__body:focus { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); }
        .rich-text-editor__body:empty::before { content: attr(data-placeholder); color: var(--color-muted); }
        .rich-text-editor__body blockquote { border-left: 3px solid var(--color-primary); margin: 1rem 0; padding-left: 1rem; color: var(--color-muted); }
        .rich-text-editor__body pre { background: #f5f5f5; padding: 0.5rem; border-radius: var(--radius-sm); overflow-x: auto; }
        .rich-text-editor__divider { width: 1px; height: 1.5rem; background: var(--color-border); margin: 0 0.25rem; }
        .rich-text-editor__btn {
          min-width: 2rem;
          min-height: 2rem;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--color-text);
          padding: 0.25rem 0.45rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          transition: all 0.15s ease;
        }
        .rich-text-editor__btn:hover:not(:disabled) { border-color: var(--color-border); background: var(--color-white); }
        .rich-text-editor__btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .rich-text-editor__body pre { background: #f5f5f5; padding: 0.5rem; border-radius: var(--radius-sm); overflow-x: auto; }
      `}</style>
    </div>
  );
}