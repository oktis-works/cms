// @oktis-works/admin - Shared Rich Text Editor
//
// Componente reutilizável para editor de texto rico (WYSIWYG).
// Usado pelo ContentEditor (editor clássico) e pelo campo wysiwyg do ThemeCustomizer.

import { createSignal } from 'solid-js';
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

  const formatBlock = (block: string) => {
    if (!block) return;
    document.execCommand('formatBlock', false, block);
    triggerChange();
  };

  const formatInline = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    triggerChange();
  };

  const createLink = () => {
    const url = window.prompt('Digite a URL:');
    if (url) {
      document.execCommand('createLink', false, url);
      triggerChange();
    }
  };

  const removeFormat = () => {
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

  const handleBlur = () => {
    const editor = editorRef();
    if (editor) {
      const sanitized = sanitizeHtml(editor.innerHTML);
      if (sanitized !== editor.innerHTML) {
        editor.innerHTML = sanitized;
      }
      onChange(sanitized);
    }
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

  const getSelectionFormat = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as HTMLElement;
    
    if (!element) return null;
    
    // Check for formatBlock
    const blockEl = element.closest('h1, h2, h3, h4, blockquote, pre, p');
    if (blockEl) {
      const tag = blockEl.tagName.toLowerCase();
      if (tag === 'p') return '';
      return `<${tag}>`;
    }
    
    return null;
  };

  return (
    <div class="rich-text-editor" data-rich-text-editor>
      <div class="rich-text-editor__toolbar" role="toolbar" aria-label="Editor de texto rico">
        {toolbar.formatBlock && (
          <select
            class="rich-text-editor__select"
            aria-label="Formato de bloco"
            value={getSelectionFormat() || ''}
            onChange={(e) => formatBlock(e.currentTarget.value)}
            disabled={disabled}
          >
            {FORMAT_BLOCK_OPTIONS.map((opt) => (
              <option value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        {toolbar.formatBlock && <span class="rich-text-editor__divider" />}
        
        {toolbar.bold && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatInline('bold')}
            disabled={disabled}
            aria-label="Negrito (Ctrl+B)"
            title="Negrito (Ctrl+B)"
          >
            <strong>B</strong>
          </button>
        )}
        {toolbar.italic && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatInline('italic')}
            disabled={disabled}
            aria-label="Itálico (Ctrl+I)"
            title="Itálico (Ctrl+I)"
          >
            <em>I</em>
          </button>
        )}
        {toolbar.underline && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatInline('underline')}
            disabled={disabled}
            aria-label="Sublinhado (Ctrl+U)"
            title="Sublinhado (Ctrl+U)"
          >
            <u>U</u>
          </button>
        )}
        {toolbar.strikeThrough && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatInline('strikeThrough')}
            disabled={disabled}
            aria-label="Tachado"
            title="Tachado"
          >
            <s>S</s>
          </button>
        )}
        
        {(toolbar.bold || toolbar.italic || toolbar.underline || toolbar.strikeThrough) && 
         <span class="rich-text-editor__divider" />}
        
        {toolbar.blockquote && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatBlock('<blockquote>')}
            disabled={disabled}
            aria-label="Bloco de citação"
            title="Bloco de citação"
          >
            ❝
          </button>
        )}
        {toolbar.code && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatBlock('<pre>')}
            disabled={disabled}
            aria-label="Código"
            title="Código"
          >
            {`<pre>`}
          </button>
        )}
        
        {(toolbar.blockquote || toolbar.code) && <span class="rich-text-editor__divider" />}
        
        {toolbar.unorderedList && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatInline('insertUnorderedList')}
            disabled={disabled}
            aria-label="Lista com marcadores"
            title="Lista com marcadores"
          >
            • Lista
          </button>
        )}
        {toolbar.orderedList && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatInline('insertOrderedList')}
            disabled={disabled}
            aria-label="Lista numerada"
            title="Lista numerada"
          >
            1. Lista
          </button>
        )}
        
        {(toolbar.unorderedList || toolbar.orderedList) && <span class="rich-text-editor__divider" />}
        
        {toolbar.link && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={createLink}
            disabled={disabled}
            aria-label="Inserir link (Ctrl+K)"
            title="Inserir link (Ctrl+K)"
          >
            🔗
          </button>
        )}
        {toolbar.unlink && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => formatInline('unlink')}
            disabled={disabled}
            aria-label="Remover link"
            title="Remover link"
          >
            🔗✕
          </button>
        )}
        
        {(toolbar.link || toolbar.unlink) && <span class="rich-text-editor__divider" />}
        
        {toolbar.undo && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => { document.execCommand('undo', false); triggerChange(); }}
            disabled={disabled}
            aria-label="Desfazer (Ctrl+Z)"
            title="Desfazer (Ctrl+Z)"
          >
            ↶
          </button>
        )}
        {toolbar.redo && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={() => { document.execCommand('redo', false); triggerChange(); }}
            disabled={disabled}
            aria-label="Refazer (Ctrl+Y)"
            title="Refazer (Ctrl+Y)"
          >
            ↷
          </button>
        )}
        {toolbar.removeFormat && (
          <button
            type="button"
            class="rich-text-editor__btn"
            onClick={removeFormat}
            disabled={disabled}
            aria-label="Limpar formatação"
            title="Limpar formatação"
          >
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
          padding: 0.5rem;
          background: #f5f5f5;
          border-bottom: 1px solid var(--color-border);
        }
        .rich-text-editor__select {
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-white);
          font-size: 0.8125rem;
          min-width: 140px;
        }
        .rich-text-editor__divider {
          width: 1px;
          height: 1.5rem;
          background: var(--color-border);
          margin: 0 0.25rem;
        }
        .rich-text-editor__btn {
          min-width: 2rem;
          min-height: 2rem;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--color-text);
          padding: 0.25rem 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .rich-text-editor__btn:hover:not(:disabled) {
          border-color: var(--color-border);
          background: var(--color-white);
        }
        .rich-text-editor__btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .rich-text-editor__body {
          min-height: 200px;
          padding: 1rem;
          font-size: 0.9375rem;
          line-height: 1.6;
          color: var(--color-text);
          outline: none;
          overflow-y: auto;
        }
        .rich-text-editor__body:focus {
          box-shadow: inset 0 0 0 2px var(--color-primary);
        }
        .rich-text-editor__body:empty::before {
          content: attr(data-placeholder);
          color: var(--color-muted);
          pointer-events: none;
        }
        .rich-text-editor__body p { margin: 0 0 1rem; }
        .rich-text-editor__body h1 { font-size: 2rem; font-weight: 700; margin: 1.5rem 0 1rem; }
        .rich-text-editor__body h2 { font-size: 1.5rem; font-weight: 600; margin: 1.25rem 0 0.75rem; }
        .rich-text-editor__body h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; }
        .rich-text-editor__body h4 { font-size: 1rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
        .rich-text-editor__body blockquote { 
          border-left: 3px solid var(--color-primary); 
          margin: 1rem 0; 
          padding-left: 1rem; 
          color: var(--color-muted);
          font-style: italic;
        }
        .rich-text-editor__body pre { 
          background: #f5f5f5; 
          padding: 1rem; 
          border-radius: var(--radius-md); 
          overflow-x: auto; 
          font-family: monospace;
          font-size: 0.875rem;
        }
        .rich-text-editor__body ul { margin: 0.5rem 0 0.5rem 1.5rem; }
        .rich-text-editor__body ol { margin: 0.5rem 0 0.5rem 1.5rem; }
        .rich-text-editor__body a { color: var(--color-primary); text-decoration: underline; }
        .rich-text-editor__body img { max-width: 100%; height: auto; border-radius: var(--radius-md); }
      `}</style>
    </div>
  );
}