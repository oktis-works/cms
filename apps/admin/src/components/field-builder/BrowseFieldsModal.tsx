import { For, Show, createMemo, createSignal } from 'solid-js';
import type { FieldCategoryInfo, FieldTypeInfo } from '../../lib/api';
import { nameFromLabel } from './model';
import { FbIcon } from './primitives/FbIcon';

type TFn = (key: string) => string;

interface BrowseFieldsModalProps {
  open: boolean;
  types: FieldTypeInfo[];
  categories: FieldCategoryInfo[];
  t: TFn;
  onClose: () => void;
  onSelect: (type: string, label: string, name: string) => void;
}

// Types surfaced on the "Popular" tab (includes the PRO-equivalent types this
// CMS ships natively: repeater, flexible_content, gallery, clone).
const POPULAR = new Set([
  'text', 'textarea', 'image', 'file', 'select', 'checkbox', 'radio', 'true_false',
  'link', 'post_object', 'relationship', 'repeater', 'flexible_content', 'gallery', 'clone', 'group',
]);

/**
 * Field type picker modal: two panes — a searchable, category-tabbed field
 * picker on the left and a preview panel on the right — with a Field Label
 * input that derives the machine name.
 */
export function BrowseFieldsModal(props: BrowseFieldsModalProps) {
  const { t } = props;
  const L = (key: string): string => t(`settings.customFields.form.${key}`);
  const [query, setQuery] = createSignal('');
  const [activeTab, setActiveTab] = createSignal('popular');
  const [selectedType, setSelectedType] = createSignal('text');
  const [label, setLabel] = createSignal('');

  const tabs = createMemo(() => [
    { id: 'popular', label: L('popularFields') },
    ...props.categories.map((c) => ({ id: c.id, label: c.label })),
  ]);

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    return props.types.filter((type) => {
      const inTab = activeTab() === 'popular' ? POPULAR.has(type.type) : type.category === activeTab();
      return inTab && (!q || type.label.toLowerCase().includes(q) || type.type.toLowerCase().includes(q));
    });
  });

  const selected = createMemo(() => props.types.find((type) => type.type === selectedType()));
  const namePreview = createMemo(() => nameFromLabel(label()) || nameFromLabel(selected()?.label ?? ''));

  return (
    <Show when={props.open}>
      <div class="fb-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
        <section class="fb-browse-modal" role="dialog" aria-modal="true" aria-label={L('selectFieldType')}>
          <header class="fb-browse-modal__header">
            <div>
              <span class="fb-eyebrow">{L('addField')}</span>
              <h3>{L('selectFieldType')}</h3>
            </div>
            <button type="button" class="fb-icon-button" aria-label={L('cancel')} onClick={props.onClose}>×</button>
          </header>

          <div class="fb-browse-modal__search">
            <input class="input" type="search" placeholder={L('searchFieldTypes')} value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
          </div>

          <nav class="fb-browse-modal__tabs" aria-label={L('fieldType')}>
            <For each={tabs()}>{(tab) => (
              <button type="button" classList={{ 'is-active': activeTab() === tab.id }} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
            )}</For>
          </nav>

          <div class="fb-browse-modal__body">
            <div class="fb-browse-grid">
              <Show when={filtered().length > 0} fallback={<p class="muted fb-browse-empty">{L('noMatchingFieldTypes')}</p>}>
                <For each={filtered()}>{(type) => (
                  <button type="button" class="fb-browse-tile" classList={{ 'is-selected': selectedType() === type.type }} onClick={() => setSelectedType(type.type)}>
                    <FbIcon name={type.icon} class="fb-browse-tile__icon" />
                    <strong>{type.label}</strong>
                    <small>{type.type}</small>
                  </button>
                )}</For>
              </Show>
            </div>
            <aside class="fb-browse-preview">
              <FbIcon name={selected()?.icon ?? 'box'} class="fb-browse-preview__icon" />
              <h4>{selected()?.label ?? L('fieldType')}</h4>
              <p class="muted">{selected()?.type}</p>
            </aside>
          </div>

          <footer class="fb-browse-modal__footer">
            <label class="fb-browse-modal__label">
              {L('fieldLabel')}
              <input class="input" value={label()} placeholder={selected()?.label ?? ''} onInput={(e) => setLabel(e.currentTarget.value)} />
              <span class="fb-setting__hint">{L('fieldName')}: <code>{namePreview()}</code></span>
            </label>
            <div class="editor-actions">
              <button type="button" class="btn btn-secondary" onClick={props.onClose}>{L('cancel')}</button>
              <button type="button" class="btn btn-primary" disabled={!selected()} onClick={() => {
                const def = selected();
                if (!def) return;
                const human = label().trim() || def.label;
                props.onSelect(def.type, human, nameFromLabel(human) || def.type);
              }}>{L('selectField')}</button>
            </div>
          </footer>
        </section>
      </div>
    </Show>
  );
}
