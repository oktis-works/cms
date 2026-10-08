// @oktis-works/admin - Classic editor inspired content workspace

import { For, Show, createSignal, onMount } from 'solid-js';
import { expandCloneFields } from '../../lib/validation';
import { sanitizeHtml } from '../../lib/sanitize';
import { apiClient, type ThemeInfo, type ContentType } from '../../lib/api';
import { FieldRenderer } from './FieldRenderer';
import type { ResolvedFieldDefinition } from './types';
import { useTranslation } from '../../i18n';

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
  const [groups, setGroups] = createSignal<ResolvedFieldDefinition[]>([]);
  const [themes, setThemes] = createSignal<ThemeInfo[]>([]);
  const [data, setData] = createSignal<Record<string, unknown>>({});
  const [errors, setErrors] = createSignal<string[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal('');

  const [draft, setDraft] = createSignal<Draft>({
    type: props.initialType || 'post',
    title: '',
    status: 'DRAFT',
  });

  const supports = (): Set<string> =>
    new Set(types().find((type) => type.slug === draft().type)?.supports ?? ['title', 'editor']);
  const hasSupport = (support: string): boolean => supports().has(support);

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
      const all = await apiClient.getFieldGroups(query.type ? query : undefined);
      const resolved = await Promise.all(
        all
          .filter((group) => group.active)
          .map(async (group) => {
            const full = await apiClient.getFieldGroup(group.id);
            return full.fields ?? [];
          })
      );
      setGroups(expandCloneFields(resolved.flat() as ResolvedFieldDefinition[]));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  };

  onMount(async () => {
    let typeList: ContentType[] = [];
    try {
      const [typeCatalog, themeList] = await Promise.all([
        apiClient.getContentTypes(),
        apiClient.getThemes().catch(() => [] as ThemeInfo[]),
      ]);
      typeList = typeCatalog;
      setTypes(typeCatalog);
      setThemes(themeList);
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
        setDraft({
          id: existing.id,
          type: existing.type,
          title: existing.title,
          slug: existing.slug,
          excerpt: existing.excerpt,
          featuredImageId:
            (rawRow['featuredImageId'] as string | undefined) ??
            (rawRow['featured_image_id'] as string | undefined),
          status: existing.status,
          layout: existing.layout,
        });
        setData((existing.body as Record<string, unknown> | undefined) ?? {});
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

  const syncEditorContent = (element: HTMLElement): void => {
    setData({ ...data(), content: element.innerHTML });
  };

  const formatEditor = (command: string, value?: string): void => {
    document.execCommand(command, false, value);
    const editor = document.querySelector<HTMLElement>('[data-classic-editor]');
    if (editor) syncEditorContent(editor);
  };

  const save = async (event: Event): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setErrors([]);
    setSaving(true);

    try {
      const payload = {
        ...draft(),
        layout: draft().layout || null,
        body: { ...data(), content: sanitizeHtml(editorContent()) },
        ...(hasSupport('excerpt') ? {} : { excerpt: undefined }),
        ...(hasSupport('thumbnail') ? {} : { featuredImageId: undefined }),
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
            <Show when={hasSupport('title')}>
              <input
                class="classic-editor__title"
                required
                aria-label={t('content.editor.title')}
                placeholder={t('content.editor.titlePlaceholder')}
                value={draft().title}
                onInput={(event) => setDraft({ ...draft(), title: event.currentTarget.value })}
              />
            </Show>

            <div class="classic-editor__permalink">
              <span>{t('content.editor.slug')}:</span>
              <input class="input" value={draft().slug ?? ''} placeholder={t('content.editor.slugPlaceholder')} onInput={(event) => setDraft({ ...draft(), slug: event.currentTarget.value })} />
            </div>

            <Show when={hasSupport('editor')}>
              <div class="classic-editor__toolbar" role="toolbar" aria-label={t('content.editor.toolbar')}>
                <button type="button" onClick={() => formatEditor('bold')}><strong>B</strong></button>
                <button type="button" onClick={() => formatEditor('italic')}><em>I</em></button>
                <button type="button" onClick={() => formatEditor('underline')}><u>U</u></button>
                <span class="classic-editor__toolbar-divider" />
                <button type="button" onClick={() => formatEditor('formatBlock', 'blockquote')}>❝</button>
                <button type="button" onClick={() => formatEditor('insertUnorderedList')}>• List</button>
                <button type="button" onClick={() => formatEditor('insertOrderedList')}>1. List</button>
                <button type="button" onClick={() => formatEditor('createLink', window.prompt(t('content.editor.linkPrompt')) || '')}>Link</button>
              </div>
              <div
                class="classic-editor__body"
                contentEditable={true}
                data-classic-editor
                role="textbox"
                aria-multiline="true"
                data-placeholder={t('content.editor.bodyPlaceholder')}
                innerHTML={sanitizeHtml(editorContent())}
                onInput={(event) => syncEditorContent(event.currentTarget)}
              />
            </Show>

            <Show when={hasSupport('excerpt')}>
              <label class="classic-editor__excerpt">
                <span>{t('content.editor.excerpt')}</span>
                <textarea class="input" rows={4} value={draft().excerpt ?? ''} onInput={(event) => setDraft({ ...draft(), excerpt: event.currentTarget.value })} />
              </label>
            </Show>
          </section>

          <Show when={groups().length > 0}>
            <section class="card custom-fields">
              <h3>{t('content.editor.customFields')}</h3>
              <For each={groups()}>{(field) => <FieldRenderer field={field} values={data()} onChange={(name, value) => setData({ ...data(), [name]: value })} />}</For>
            </section>
          </Show>
        </main>

        <aside class="classic-editor__sidebar">
          <section class="card classic-editor__panel">
            <h3>{t('content.editor.publishPanel')}</h3>
            <label>
              {t('content.editor.status')}
              <select class="input" value={draft().status} onChange={(event) => setDraft({ ...draft(), status: event.currentTarget.value })}>
                <option value="DRAFT">{t('content.editor.statusOptions.draft')}</option>
                <option value="PUBLISHED">{t('content.editor.statusOptions.published')}</option>
                <option value="ARCHIVED">{t('content.editor.statusOptions.archived')}</option>
              </select>
            </label>
            <button type="submit" class="btn btn-primary classic-editor__full-button" disabled={saving()}>{saving() ? t('content.editor.saving') : t('content.editor.save')}</button>
          </section>

          <Show when={hasSupport('thumbnail')}>
            <section class="card classic-editor__panel">
              <h3>{t('content.editor.featuredImage')}</h3>
              <input class="input" value={draft().featuredImageId ?? ''} placeholder={t('content.editor.mediaIdPlaceholder')} onInput={(event) => setDraft({ ...draft(), featuredImageId: event.currentTarget.value })} />
              <p class="muted">{t('content.editor.featuredImageHint')}</p>
            </section>
          </Show>

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
        </aside>
      </div>
    </form>
  );
}
