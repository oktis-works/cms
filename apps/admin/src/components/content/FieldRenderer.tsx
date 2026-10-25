// @oktis-works/admin - FieldRenderer (renderização de campos customizados por tipo)

import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { validateFieldClient } from '../../lib/validation';
import { sanitizeHtml } from '../../lib/sanitize';
import { apiClient, type Media } from '../../lib/api';
import type { ResolvedFieldDefinition } from './types';
import { RelationshipPicker } from './RelationshipPicker';
import { PluginFieldRenderer } from '../../content/PluginFieldRenderer';
import { MediaPickerModal, type MediaPickerMode } from '../media/MediaPickerModal';

export interface FieldRendererProps {
  field: ResolvedFieldDefinition;
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  t: (key: string) => string;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'boolean' && !value)
  );
}

/** Slug de URL: minúsculas, sem acentos, separado por hífens (mesmo do core). */
function slugifyValue(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (typeof b === 'boolean') return Boolean(a) === b;
  const na = Number(a);
  const nb = Number(b);
  return a === b || (!Number.isNaN(na) && !Number.isNaN(nb) && na === nb);
}

/**
 * Avalia a lógica condicional do campo no cliente (mesmas regras do core).
 */
export function isFieldVisible(field: ResolvedFieldDefinition, values: Record<string, unknown>): boolean {
  const logic = field.conditionalLogic as
    | { groups?: Array<{ match?: string; rules?: Array<{ field: string; operator: string; value: unknown }> }> }
    | null;

  if (!logic?.groups || logic.groups.length === 0) return true;

  const evaluateGroup = (group: { match?: string; rules?: Array<{ field: string; operator: string; value: unknown }> }): boolean => {
    const rules = group.rules ?? [];
    if (rules.length === 0) return true;

    const results = rules.map((rule) => {
      const target = values[rule.field];

      switch (rule.operator) {
        case 'eq':
          return looseEquals(target, rule.value);
        case 'neq':
          return !looseEquals(target, rule.value);
        case 'gt':
          return Number(target) > Number(rule.value);
        case 'lt':
          return Number(target) < Number(rule.value);
        case 'contains':
          return Array.isArray(target)
            ? target.includes(rule.value)
            : String(target ?? '').includes(String(rule.value));
        case 'pattern_matches':
          try {
            return new RegExp(String(rule.value)).test(String(target ?? ''));
          } catch {
            return false;
          }
        case 'has_any_value':
          return !isEmpty(target);
        case 'has_no_value':
          return isEmpty(target);
        default:
          return false;
      }
    });

    return group.match === 'ANY' ? results.some(Boolean) : results.every(Boolean);
  };

  return logic.groups.map(evaluateGroup).some(Boolean);
}

const LAYOUT_ONLY = new Set(['message', 'tab', 'accordion']);

export function FieldRenderer(props: FieldRendererProps) {
  const visible = () => isFieldVisible(props.field, props.values);
  const [dirty, setDirty] = createSignal(false);

  const valueFor = (): unknown => props.values[props.field.name];

  // Validação client-side (mesmas regras do core, executadas no browser).
  // validateFieldClient retorna a primeira mensagem de erro ou null (válido).
  const validationError = createMemo(() => {
    if (!dirty()) return null;
    return validateFieldClient(props.field as never, props.values[props.field.name]);
  });

  const setValue = (value: unknown): void => {
    setDirty(true);
    props.onChange(props.field.name, value);
  };

  return (
    <Show when={visible() && !LAYOUT_ONLY.has(props.field.type)}>
      <div class="field-renderer" data-field-type={props.field.type}>
        <label class="field-renderer__label">
          {props.field.label}
          <Show when={props.field.required}>
            <span class="field-renderer__required">*</span>
          </Show>
        </label>

        <Show when={props.field.instructions}>
          <p class="field-renderer__instructions">{props.field.instructions}</p>
        </Show>

        <FieldControl field={props.field} value={valueFor()} onChange={setValue} values={props.values} t={props.t} />

        <Show when={validationError()}>
          <p class="field-renderer__error" role="alert">
            {validationError()}
          </p>
        </Show>
      </div>
    </Show>
  );
}

interface FieldControlProps {
  field: ResolvedFieldDefinition;
  value: unknown;
  values: Record<string, unknown>;
  onChange: (value: unknown) => void;
  t: (key: string) => string;
}

function FieldControl(props: FieldControlProps) {
  const config = () => props.field.config ?? {};

  // WYSIWYG editor helpers (execCommand-based, same as classic editor)
  const formatBlock = (block: string): void => {
    if (!block) return;
    document.execCommand('formatBlock', false, block);
    // Trigger onInput to update value
    const editor = document.querySelector('.field-renderer__wysiwyg-body[contenteditable="true"]:focus');
    if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const formatInline = (command: string): void => {
    document.execCommand(command, false);
    const editor = document.querySelector('.field-renderer__wysiwyg-body[contenteditable="true"]:focus');
    if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const createLink = (): void => {
    const url = window.prompt(props.t('content.editor.linkPrompt') || '');
    if (url) {
      document.execCommand('createLink', false, url);
      const editor = document.querySelector('.field-renderer__wysiwyg-body[contenteditable="true"]:focus');
      if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  switch (props.field.type) {
    case 'text':
      return (
        <input
          type="text"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          placeholder={config()['placeholder'] as string | undefined}
          maxLength={(config()['maxLength'] ?? config()['characterLimit']) as number | undefined}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          onBlur={(e) => props.onChange(e.currentTarget.value.trim())}
        />
      );
    case 'textarea':
      return (
        <textarea
          class="input"
          rows={(config()['rows'] as number | undefined) ?? 4}
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          placeholder={config()['placeholder'] as string | undefined}
          maxLength={(config()['maxLength'] ?? config()['characterLimit']) as number | undefined}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      );
    case 'wysiwyg':
      return (
        <div class="field-renderer__wysiwyg">
          <div class="field-renderer__wysiwyg-toolbar" role="toolbar" aria-label={props.t('content.editor.toolbar')}>
            <select class="input" aria-label={props.t('content.editor.format')} onChange={(e) => formatBlock(e.currentTarget.value)} value="">
              <option value="">{props.t('content.editor.formatParagraph')}</option>
              <option value="<h1>">{props.t('content.editor.formatH1')}</option>
              <option value="<h2>">{props.t('content.editor.formatH2')}</option>
              <option value="<h3>">{props.t('content.editor.formatH3')}</option>
              <option value="<h4>">{props.t('content.editor.formatH4')}</option>
              <option value="<blockquote>">{props.t('content.editor.formatBlockquote')}</option>
              <option value="<pre>">{props.t('content.editor.formatCode')}</option>
            </select>
            <span class="field-renderer__wysiwyg-divider" />
            <button type="button" onClick={() => formatInline('bold')}>
              <strong>{props.t('content.editor.bold')}</strong>
            </button>
            <button type="button" onClick={() => formatInline('italic')}>
              <em>{props.t('content.editor.italic')}</em>
            </button>
            <button type="button" onClick={() => formatInline('underline')}>
              <u>{props.t('content.editor.underline')}</u>
            </button>
            <span class="field-renderer__wysiwyg-divider" />
            <button type="button" onClick={() => formatInline('insertUnorderedList')}>
              {props.t('content.editor.bulletList')}
            </button>
            <button type="button" onClick={() => formatInline('insertOrderedList')}>
              {props.t('content.editor.numberedList')}
            </button>
            <button type="button" onClick={() => createLink()}>
              {props.t('content.editor.link')}
            </button>
          </div>
          <div
            class="field-renderer__wysiwyg-body input"
            contentEditable={true}
            role="textbox"
            aria-multiline="true"
            data-placeholder={config()['placeholder'] as string | undefined}
            innerHTML={(props.value ?? config()['defaultValue'] ?? '') as string}
            onInput={(event) => {
              const html = event.currentTarget.innerHTML;
              props.onChange(html);
            }}
            onBlur={(event) => {
              const sanitized = sanitizeHtml(event.currentTarget.innerHTML);
              if (sanitized !== event.currentTarget.innerHTML) {
                event.currentTarget.innerHTML = sanitized;
                props.onChange(sanitized);
              }
            }}
          />
        </div>
      );
    case 'number':
    case 'range':
      return (
        <input
          type="number"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string | number}
          min={(config()['min'] ?? config()['minValue']) as number | undefined}
          max={(config()['max'] ?? config()['maxValue']) as number | undefined}
          step={config()['step'] as number | undefined}
          onInput={(e) => props.onChange(e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
        />
      );
    case 'email':
      return (
        <input
          type="email"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      );
    case 'url':
      return (
        <input
          type="url"
          class="input"
          placeholder="https://"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      );
    case 'password':
      return (
        <input
          type="password"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      );
    case 'slug':
      return (
        <input
          type="text"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          placeholder={config()['placeholder'] as string | undefined}
          onInput={(e) => props.onChange(slugifyValue(e.currentTarget.value))}
          onBlur={(e) => props.onChange(slugifyValue(e.currentTarget.value.trim()))}
        />
      );
    case 'true_false':
      return (
        <input
          type="checkbox"
          checked={Boolean(props.value)}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
        />
      );
    case 'select':
      return (
        <select
          class="input"
          multiple={config()['multiple'] === true}
          value={config()['multiple'] === true
            ? (Array.isArray(props.value) ? props.value : [])
            : ((props.value ?? config()['defaultValue'] ?? '') as string)}
          onChange={(e) =>
            props.onChange(
              e.currentTarget.multiple
                ? Array.from(e.currentTarget.selectedOptions).map((option) => option.value)
                : e.currentTarget.value
            )
          }
        >
          <For each={(config()['choices'] as Array<{ value: string; label: string }>) ?? []}>
            {(choice) => <option value={choice.value}>{choice.label}</option>}
          </For>
        </select>
      );
    case 'radio':
      return (
        <div class="field-renderer__choices">
          <For each={(config()['choices'] as Array<{ value: string; label: string }>) ?? []}>
            {(choice) => (
              <label>
                <input
                  type="radio"
                  name={props.field.name}
                  checked={props.value === choice.value}
                  onChange={() => props.onChange(choice.value)}
                />
                {' '}
                {choice.label}
              </label>
            )}
          </For>
        </div>
      );
    case 'checkbox':
      return (
        <div class="field-renderer__choices">
          <For each={(config()['choices'] as Array<{ value: string; label: string }>) ?? []}>
            {(choice) => {
              const checked = () => Array.isArray(props.value) && props.value.includes(choice.value);
              return (
                <label>
                  <input
                    type="checkbox"
                    checked={checked()}
                    onChange={(e) => {
                      const current = Array.isArray(props.value) ? [...props.value] : [];
                      props.onChange(
                        e.currentTarget.checked ? [...current, choice.value] : current.filter((entry) => entry !== choice.value)
                      );
                    }}
                  />
                  {' '}
                  {choice.label}
                </label>
              );
            }}
          </For>
        </div>
      );
    case 'date_picker':
      return (
        <input
          type="date"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      );
    case 'date_time_picker':
      return (
        <input
          type="datetime-local"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      );
    case 'time_picker':
      return (
        <input
          type="time"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      );
    case 'color_picker':
      return (
        <input
          type="color"
          class="input"
          value={(props.value ?? config()['defaultValue'] ?? '') as string}
          onChange={(e) => props.onChange(e.currentTarget.value)}
        />
      );
    case 'image':
    case 'file':
      return <MediaFieldInput mode={props.field.type} value={props.value} onChange={props.onChange} />;
    case 'gallery':
      return <MediaFieldInput mode="gallery" value={props.value} onChange={props.onChange} />;
    case 'google_map':
      return (
        <div class="field-renderer__map">
          <input
            type="text"
            class="input"
            placeholder="Endereço"
            value={((props.value as Record<string, unknown>)?.['address'] as string) ?? ''}
            onInput={(e) => {
              const map = (props.value as Record<string, unknown>) ?? {};
              props.onChange({ ...map, address: e.currentTarget.value });
            }}
          />
          <input
            type="number"
            class="input"
            placeholder="Latitude (-90 a 90)"
            step="any"
            min={-90}
            max={90}
            value={((props.value as Record<string, unknown>)?.['lat'] as number) ?? ''}
            onInput={(e) => {
              const map = (props.value as Record<string, unknown>) ?? {};
              props.onChange({ ...map, lat: Number(e.currentTarget.value) });
            }}
          />
          <input
            type="number"
            class="input"
            placeholder="Longitude (-180 a 180)"
            step="any"
            min={-180}
            max={180}
            value={((props.value as Record<string, unknown>)?.['lng'] as number) ?? ''}
            onInput={(e) => {
              const map = (props.value as Record<string, unknown>) ?? {};
              props.onChange({ ...map, lng: Number(e.currentTarget.value) });
            }}
          />
        </div>
      );
    case 'link':
      return (
        <div class="field-renderer__link">
          <input
            type="url"
            class="input"
            placeholder="https:// ou /caminho"
            value={((props.value as Record<string, unknown>)?.['url'] as string) ?? ''}
            onInput={(e) => {
              const link = (props.value as Record<string, unknown>) ?? {};
              props.onChange({ ...link, url: e.currentTarget.value });
            }}
          />
          <select
            class="input"
            value={((props.value as Record<string, unknown>)?.['target'] as string) ?? '_self'}
            onChange={(e) => {
              const link = (props.value as Record<string, unknown>) ?? {};
              props.onChange({ ...link, target: e.currentTarget.value });
            }}
          >
            <option value="_self">Mesma janela</option>
            <option value="_blank">Nova janela</option>
          </select>
        </div>
      );
    case 'relationship':
    case 'post_object':
      return (
        <RelationshipPicker
          postType={config()['postType'] as string | undefined}
          multiple={config()['multiple'] !== false}
          value={props.value}
          onChange={props.onChange}
        />
      );
    case 'taxonomy':
      return (
        <RelationshipSelector
          field={props.field}
          value={props.value}
          onChange={props.onChange}
          multiple={config()['multiple'] !== false}
        />
      );
    case 'user':
      if (props.field.isCoreField && props.field.coreFieldKey === 'author') {
        return <input type="text" class="input" value={(props.value ?? '') as string} readOnly aria-readonly="true" />;
      }
      return (
        <RelationshipSelector
          field={props.field}
          value={props.value}
          onChange={props.onChange}
          multiple={config()['multiple'] !== false}
        />
      );
    case 'repeater': {
      const rows = () => (Array.isArray(props.value) ? (props.value as Record<string, unknown>[]) : []);
      return (
        <div class="field-renderer__rows">
          <For each={rows()}>
            {(row, index) => (
              <RepeaterRow
                field={props.field}
                row={row}
                index={index()}
                t={props.t}
                onUpdate={(updated) => {
                  const next = [...rows()];
                  next[index()] = updated;
                  props.onChange(next);
                }}
                onRemove={() => {
                  props.onChange(rows().filter((_, i) => i !== index()));
                }}
              />
            )}
          </For>
          <button type="button" class="btn" onClick={() => props.onChange([...rows(), {}])}>
            + Adicionar linha
          </button>
        </div>
      );
    }
    case 'flexible_content': {
      // As layouts resolvidas vivem em `field.layouts` (árvore do grupo);
      // `config.layouts` é o fallback para dados legados.
      const layouts = ():
        Array<{ name: string; label?: string; subFields?: ResolvedFieldDefinition[] }> => {
        if (props.field.layouts.length > 0) return props.field.layouts;
        return (
          (config()['layouts'] as Array<{
            name: string;
            label?: string;
            subFields?: ResolvedFieldDefinition[];
          }>) ?? []
        );
      };
      const rows = () => {
        const raw = Array.isArray(props.value) ? (props.value as Record<string, unknown>[]) : [];
        return raw.map((row) => ({
          fc_layout: String(row['fc_layout'] ?? ''),
          data: row,
        }));
      };

      return (
        <div class="field-renderer__rows">
          <For each={rows()}>
            {(row, index) => {
              const layout = () => layouts().find((entry) => entry.name === row.fc_layout);
              const rowData = (): Record<string, unknown> => {
                const { fc_layout: _layout, ...data } = row.data;
                void _layout;
                return data;
              };

              return (
                <div class="field-renderer__row">
                  <div class="field-renderer__row-header">
                    <span>
                      {layout()?.label || row.fc_layout || 'Linha'} {index() + 1}
                    </span>
                    <button
                      type="button"
                      class="btn"
                      disabled={index() === 0}
                      onClick={() => {
                        const next = [...(Array.isArray(props.value) ? props.value : [])];
                        [next[index() - 1], next[index()]] = [next[index()], next[index() - 1]];
                        props.onChange(next);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="btn"
                      disabled={index() === rows().length - 1}
                      onClick={() => {
                        const next = [...(Array.isArray(props.value) ? props.value : [])];
                        [next[index()], next[index() + 1]] = [next[index() + 1], next[index()]];
                        props.onChange(next);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger"
                      onClick={() => props.onChange((Array.isArray(props.value) ? props.value : []).filter((_, i) => i !== index()))}
                    >
                      Remover
                    </button>
                  </div>

                  <Show when={layout()} fallback={<p class="field-renderer__instructions">Layout "{row.fc_layout}" não encontrado.</p>}>
                    <For each={layout()!.subFields ?? []}>
                      {(sub) => (
                        <FieldRenderer
                          field={sub}
                          values={rowData()}
                          t={props.t}
                          onChange={(name, value) => {
                            const current = [...(Array.isArray(props.value) ? props.value : [])] as Record<string, unknown>[];
                            current[index()] = { ...current[index()], [name]: value };
                            props.onChange(current);
                          }}
                        />
                      )}
                    </For>
                  </Show>
                </div>
              );
            }}
          </For>

          <select
            class="input"
            value=""
            onChange={(e) => {
              if (!e.currentTarget.value) return;
              props.onChange([...(Array.isArray(props.value) ? props.value : []), { fc_layout: e.currentTarget.value }]);
              e.currentTarget.value = '';
            }}
          >
            <option value="">+ Adicionar layout...</option>
            <For each={layouts()}>
              {(layout) => <option value={layout.name}>{layout.label ?? layout.name}</option>}
            </For>
          </select>
        </div>
      );
    }
    case 'group':
      return (
        <fieldset class="field-renderer__group">
          <For each={props.field.subFields ?? []}>
            {(sub) => (
              <FieldRenderer
                field={sub}
                values={((props.value as Record<string, unknown>) ?? {})}
                t={props.t}
                onChange={(name, val) =>
                  props.onChange({
                    ...((props.value as Record<string, unknown>) ?? {}),
                    [name]: val,
                  })
                }
              />
            )}
          </For>
        </fieldset>
      );
    default:
      // Check if it's a plugin field type
      if (props.field.isPluginType && (props.field.adminRendererPath || props.field.adminComponentPath)) {
        return (
          <PluginFieldRenderer
            field={props.field}
            value={props.value}
            onChange={props.onChange}
            adminRendererPath={props.field.adminRendererPath}
            adminComponentPath={props.field.adminComponentPath}
            _t={props.t}
          />
        );
      }
      return (
        <input
          type="text"
          class="input"
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      );
  }
}

interface RepeaterRowProps {
  field: ResolvedFieldDefinition;
  row: Record<string, unknown>;
  index: number;
  t: (key: string) => string;
  onUpdate: (row: Record<string, unknown>) => void;
  onRemove: () => void;
}

function RepeaterRow(props: RepeaterRowProps) {
  return (
    <div class="field-renderer__row">
      <div class="field-renderer__row-header">
        <span>Linha {props.index + 1}</span>
        <button type="button" class="btn btn-danger" onClick={() => props.onRemove()}>
          Remover
        </button>
      </div>
      <For each={props.field.subFields ?? []}>
        {(sub) => (
          <FieldRenderer
            field={sub}
            values={props.row}
            t={props.t}
            onChange={(name, value) => props.onUpdate({ ...props.row, [name]: value })}
          />
        )}
      </For>
    </div>
  );
}

function MediaFieldInput(props: { mode: MediaPickerMode; value: unknown; onChange: (value: unknown) => void }) {
  const [open, setOpen] = createSignal(false);
  const [resolved, setResolved] = createSignal<Media | Media[] | null>(null);
  const [stale, setStale] = createSignal(false);

  onMount(() => {
    const value = props.value;
    const ids = (Array.isArray(value) ? value : value ? [value] : [])
      .filter((item): item is string => typeof item === 'string');
    if (ids.length === 0) {
      setStale(false);
      setResolved((Array.isArray(value) ? value : value ? [value] : []) as Media[]);
      return;
    }
    void Promise.all(ids.map((id) => apiClient.getMedia(id).catch(() => null))).then((items) => {
      const media = items.filter((item): item is Media => item !== null);
      setStale(media.length !== ids.length);
      setResolved(props.mode === 'gallery' ? media : media[0] ?? null);
    });
  });

  const currentItems = (): Media[] => {
    const value = resolved() ?? props.value;
    return (Array.isArray(value) ? value : value ? [value] : [])
      .filter((item): item is Media => typeof item === 'object' && item !== null && typeof (item as Media).id === 'string');
  };

  const pickerValue = (): Media | Media[] | null => {
    const items = currentItems();
    return props.mode === 'gallery' ? items : items[0] ?? null;
  };

  return (
    <div class="media-field-input">
      <Show when={stale()}>
        <p class="notice notice--warning" role="alert">The selected media is no longer available. Choose a replacement.</p>
      </Show>
      <Show when={currentItems().length > 0}>
        <div class="media-field-input__preview">
          <For each={currentItems()}>
            {(media) => (
              <div class="media-field-input__item">
                <Show when={media.mime_type.startsWith('image/')} fallback={<span>{media.filename}</span>}>
                  <img src={apiClient.mediaUrl(media.url)} alt={media.alt ?? media.filename} />
                </Show>
                <span title={media.filename}>{media.title || media.filename}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="media-field-input__actions">
        <button type="button" class="btn btn-secondary" onClick={() => setOpen(true)}>
          {currentItems().length > 0 ? 'Change media' : 'Choose media'}
        </button>
        <Show when={currentItems().length > 0}>
          <button type="button" class="btn btn-ghost" onClick={() => { setResolved(null); props.onChange(props.mode === 'gallery' ? [] : null); }}>Remove</button>
        </Show>
      </div>
      <Show when={open()}>
        <MediaPickerModal
          open={open()}
          mode={props.mode}
          value={pickerValue()}
          onClose={() => setOpen(false)}
          onSelect={(media) => {
            setResolved(media);
            props.onChange(Array.isArray(media) ? media.map((item) => item.id) : media.id);
            setOpen(false);
          }}
        />
      </Show>
    </div>
  );
}

function RelationshipSelector(props: {
  field: ResolvedFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  multiple: boolean;
}) {
  const selectedIds = () => (Array.isArray(props.value) ? props.value : props.value ? [props.value] : []);

  return (
    <select
      class="input"
      multiple={props.multiple}
      size={Math.min(6, Math.max(3, ((props.field.config?.['choices'] as unknown[]) ?? []).length || 3))}
      onChange={(e) => {
        const ids = Array.from(e.currentTarget.selectedOptions).map((option) => option.value);
        props.onChange(props.multiple ? ids : ids[0]);
      }}
    >
      <For each={(props.field.config?.['choices'] as Array<{ value: string; label: string }>) ?? []}>
        {(choice) => (
          <option value={choice.value} selected={selectedIds().includes(choice.value)}>
            {choice.label}
          </option>
        )}
      </For>
    </select>
  );
}
