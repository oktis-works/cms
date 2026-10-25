// @oktis-works/admin - Classic editor inspired content workspace

import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { expandCloneFields } from '../../lib/validation';
import { sanitizeHtml } from '../../lib/sanitize';
import { apiClient, type ThemeInfo, type ContentType, type PluginBlockCatalogEntry, type PluginPatternCatalogEntry } from '../../lib/api';
import { FieldRenderer } from './FieldRenderer';
import type { ResolvedFieldGroup } from './types';
import { useTranslation } from '../../i18n';
import type { AdminExtensionsState } from '@oktis-works/plugin-sdk';
import { logicalValuesToBody, normalizeLogicalValues } from '@oktis-works/validation';
import { MetaBoxesSlot, PluginComponentHost } from '../../ext/slots';
import { emptyExtensionsState, loadExtensions } from '../../ext/store';

interface Draft {
  id?: string;
  type: string;
  title: string;
  slug?: string;
  excerpt?: string;
  featuredImageId?: string;
  status: string;
  layout?: string | null;
}

interface Props {
  initialType?: string;
  singleton?: boolean;
}

export function ContentEditor(props: Props) {
  const { t } = useTranslation();
  const [types, setTypes] = createSignal<ContentType[]>([]);
  const [groups, setGroups] = createSignal<ResolvedFieldGroup[]>([]);
  const [themes, setThemes] = createSignal<ThemeInfo[]>([]);
  const [data, setData] = createSignal<Record<string, unknown>>({});
  const [errors, setErrors] = createSignal<string[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal('');
  const [extensions, setExtensions] = createSignal<AdminExtensionsState>(emptyExtensionsState());
  const [blocks, setBlocks] = createSignal<PluginBlockCatalogEntry[]>([]);
  const [patterns, setPatterns] = createSignal<PluginPatternCatalogEntry[]>([]);

  const [draft, setDraft] = createSignal<Draft>({
    type: props.initialType || 'post',
    title: '',
    status: 'DRAFT',
  });

  // Active plugin editor for this screen (editor slot — FEAT-098): registrations
  // matching the current content type (or the '*' wildcard) sorted by priority
  // (lowest runs first); the first match takes over the body area.
  const activeEditor = createMemo(() => {
    const screen = draft().type;
    const matches = (extensions().editors ?? [])
      .filter((editor) => editor.screens.includes('*') || editor.screens.includes(screen))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    return matches[0] ?? null;
  });

  // Contract handed to the plugin editor component: setBody(html) writes the
  // same `data().content` signal the classic contenteditable syncs, so save
  // keeps sanitizing and persisting `body.content` with no storage change.
  const editorSlotProps = (): Record<string, unknown> => ({
    editorId: activeEditor()!.id,
    contentType: draft().type,
    contentId: draft().id ?? '',
    body: editorContent(),
    setBody: (html: string) => setData({ ...data(), content: html }),
    disabled: saving(),
  });

  const typeListFallback = (available: ContentType[], requested?: string): string =>
    requested || available[0]?.slug || 'post';

  const availableLayouts = () => {
    const layouts = new Set<string>();
    for (const theme of themes()) {
      for (const layout of theme.manifest?.provides?.layouts ?? []) layouts.add(layout);
    }
    return [...layouts].sort();
  };

  const loadGroups = async (context: { type?: string; slug?: string; status?: string } | string): Promise<void> => {
    try {
      const query = typeof context === 'string' ? { type: context } : context;
      if (!query.type) {
        setGroups([]);
        return;
      }
      const resolved = await apiClient.getFieldGroups(query);
      setGroups(resolved
        .filter((group) => group.active !== false)
        .map((group) => ({
          ...group,
          fields: expandCloneFields((group.fields ?? []) as never) as ResolvedFieldGroup['fields'],
        })));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  };

  onMount(async () => {
    // Plugin slots (metaboxes) are optional shared state between screens.
    void loadExtensions().then(setExtensions);

    let typeList: ContentType[] = [];
    try {
      const [typeCatalog, themeList, blockCatalog, patternCatalog] = await Promise.all([
        apiClient.getContentTypes(),
        apiClient.getThemes().catch(() => [] as ThemeInfo[]),
        apiClient.getBlocks().catch(() => [] as PluginBlockCatalogEntry[]),
        apiClient.getPatterns().catch(() => [] as PluginPatternCatalogEntry[]),
      ]);
      typeList = typeCatalog;
      setTypes(typeCatalog);
      setThemes(themeList);
      setBlocks(blockCatalog);
      setPatterns(patternCatalog);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }

    const editId = new URLSearchParams(window.location.search).get('id');
    if (editId || props.singleton) {
      try {
        const existing = editId
          ? await apiClient.getContentById(editId)
          : await apiClient.getSingletonContent(draft().type);
        if (!existing) {
          await loadGroups({ type: draft().type, status: draft().status });
          return;
        }
        const rawRow = existing as unknown as Record<string, unknown>;
        const logical = normalizeLogicalValues({
          body: existing.body,
          data: rawRow['data'],
          native: rawRow,
        });
        setDraft({
          id: existing.id,
          type: existing.type,
          title: String(logical['title'] ?? existing.title),
          slug: String(logical['slug'] ?? existing.slug),
          excerpt: typeof logical['excerpt'] === 'string' ? logical['excerpt'] : undefined,
          featuredImageId: typeof logical['featured_image'] === 'string' ? logical['featured_image'] : undefined,
          status: String(logical['status'] ?? existing.status),
          layout: existing.layout,
        });
        setData(logical);
      } catch (err) {
        setErrors([err instanceof Error ? err.message : String(err)]);
      }
    } else if (!typeList.some((type) => type.slug === draft().type)) {
      setDraft({ ...draft(), type: typeListFallback(typeList, props.initialType) });
    }

    await loadGroups({ type: draft().type, slug: draft().slug, status: draft().status });
  });

  const editorContent = (): string => {
    const value = data()['content'];
    return typeof value === 'string' ? value : '';
  };

  const insertPattern = (pattern: PluginPatternCatalogEntry): void => {
    setData({ ...data(), content: `${editorContent()}\n${sanitizeHtml(pattern.content)}`.trim() });
  };

  const insertBlock = (block: PluginBlockCatalogEntry): void => {
    const current = Array.isArray(data()['_blocks']) ? data()['_blocks'] as unknown[] : [];
    setData({ ...data(), _blocks: [...current, { type: block.type, attrs: {} }] });
  };

  const save = async (event: Event): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setErrors([]);
    setSaving(true);

    try {
      const html = sanitizeHtml(editorContent());
      const currentData = data();
      const logical: Record<string, unknown> = { ...currentData, content: html };
      const body = logicalValuesToBody(logical);
      const payload = {
        ...draft(),
        title: String(logical['title'] ?? draft().title),
        slug: String(logical['slug'] ?? draft().slug ?? ''),
        excerpt: typeof logical['excerpt'] === 'string' ? logical['excerpt'] : undefined,
        featuredImageId: typeof logical['featured_image'] === 'string' ? logical['featured_image'] : undefined,
        seoTitle: typeof logical['seo_title'] === 'string' ? logical['seo_title'] : undefined,
        seoDescription: typeof logical['seo_description'] === 'string' ? logical['seo_description'] : undefined,
        status: String(logical['status'] ?? draft().status),
        layout: draft().layout || null,
        body,
      };

      const saved = draft().id
        ? await apiClient.updateContent(draft().id!, payload)
        : await apiClient.createContent(payload);

      setDraft({ ...draft(), id: saved.id });
      setMessage(t('content.editor.saved'));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form class="content-editor classic-editor" onSubmit={save}>
      <Show when={errors().length > 0}>
        <For each={errors()}>{(err) => <div class="notice notice--error">{err}</div>}</For>
      </Show>
      <Show when={message()}>
        <div class="notice notice--success">{message()}</div>
      </Show>

      <div class="classic-editor__topbar">
        <div>
          <span class="classic-editor__eyebrow">{types().find((type) => type.slug === draft().type)?.singularLabel || draft().type}</span>
          <h2>{draft().id ? t('content.editor.editing') : t('content.editor.adding')}</h2>
        </div>
        <div class="classic-editor__actions">
          <a class="btn btn-secondary" href={`/content/${encodeURIComponent(draft().type)}`}>{t('content.editor.backToList')}</a>
          <button type="submit" class="btn btn-primary" disabled={saving()}>{saving() ? t('content.editor.saving') : t('content.editor.save')}</button>
        </div>
      </div>

      <div class="classic-editor__columns">
        <main class="classic-editor__main">
          <section class="card classic-editor__canvas-card">
            <p class="field-renderer__instructions">All standard and custom values use the same resolved field schema.</p>
            {/* Editor slot, replace-body mode — the plugin owns the body editor. */}
            <Show when={activeEditor()?.mode === 'replace-body'}>
              <div class="plugin-editor plugin-editor--replace-body" data-plugin-editor={activeEditor()!.id}>
                <PluginComponentHost componentId={activeEditor()!.componentId} extraProps={editorSlotProps()} />
              </div>
            </Show>
            {/* Editor slot, below mode — plugin UI under the unified field tree */}
            <Show when={activeEditor()?.mode === 'below'}>
              <div class="plugin-editor plugin-editor--below" data-plugin-editor={activeEditor()!.id}>
                <PluginComponentHost componentId={activeEditor()!.componentId} extraProps={editorSlotProps()} />
              </div>
            </Show>

          </section>

          <For each={groups()}>
            {(group) => (
              <section
                class="card custom-fields"
                data-field-group={group.key}
                data-position={group.position ?? 'normal'}
                data-display-style={group.displayStyle ?? 'standard'}
              >
                <h3>{group.title}</h3>
                <For each={group.fields}>{(field) => (
                  <FieldRenderer
                    field={field}
                    values={data()}
                    onChange={(name, value) => setData({ ...data(), [name]: value })}
                    t={t}
                  />
                )}</For>
              </section>
            )}
          </For>

          {/* Plugin metaboxes (normal context) — FEAT-098 / DECI-027 */}
          <MetaBoxesSlot extensions={extensions()} screen={draft().type} context="normal" />
        </main>

        <aside class="classic-editor__sidebar">
          <section class="card classic-editor__panel">
            <h3>{t('content.editor.publishPanel')}</h3>
            <p class="muted">Status and all other values are edited in the resolved field groups.</p>
            <button type="submit" class="btn btn-primary classic-editor__full-button" disabled={saving()}>{saving() ? t('content.editor.saving') : t('content.editor.save')}</button>
          </section>

          <Show when={availableLayouts().length > 0}>
            <section class="card classic-editor__panel">
              <h3>{t('content.editor.pageAttributes')}</h3>
              <label>
                {t('content.editor.layout')}
                <select class="input" value={draft().layout ?? ''} onChange={(event) => setDraft({ ...draft(), layout: event.currentTarget.value || null })}>
                  <option value="">{t('content.editor.layoutAuto')}</option>
                  <For each={availableLayouts()}>{(layout) => <option value={layout}>{layout}</option>}</For>
                </select>
              </label>
            </section>
          </Show>

          <Show when={blocks().length > 0 || patterns().length > 0}>
            <section class="card classic-editor__panel plugin-catalog-panel">
              <h3>Plugin blocks and patterns</h3>
              <For each={blocks()}>{(block) => <button type="button" class="btn btn-secondary" onClick={() => insertBlock(block)}>＋ {block.label}</button>}</For>
              <For each={patterns()}>{(pattern) => <button type="button" class="btn btn-secondary" onClick={() => insertPattern(pattern)}>＋ {pattern.label}</button>}</For>
            </section>
          </Show>

          {/* Metaboxes de plugin (context side) — FEAT-098 / DECI-027 */}
          <MetaBoxesSlot extensions={extensions()} screen={draft().type} context="side" />
        </aside>
      </div>

      {/* Metaboxes de plugin (context advanced) — FEAT-098 / DECI-027 */}
      <MetaBoxesSlot extensions={extensions()} screen={draft().type} context="advanced" />

    </form>
  );
}
