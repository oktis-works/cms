// @oktis-works/admin - Content Editor (conteúdo base + campos customizados)

import { For, Show, createSignal, onMount } from 'solid-js';
import { expandCloneFields } from '../../lib/validation';
import { apiClient, type ThemeInfo } from '../../lib/api';
import type { ContentType } from '../../lib/api';
import { FieldRenderer } from './FieldRenderer';
import { FieldTypePicker } from './FieldTypePicker';
import type { FieldTypeInfo, FieldCategoryInfo } from '../../lib/api';
import type { ResolvedFieldDefinition } from './types';

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

export function ContentEditor() {
  const [types, setTypes] = createSignal<ContentType[]>([]);
  const [fieldTypes, setFieldTypes] = createSignal<FieldTypeInfo[]>([]);
  const [categories, setCategories] = createSignal<FieldCategoryInfo[]>([]);
  const [groups, setGroups] = createSignal<ResolvedFieldDefinition[]>([]);
  const [themes, setThemes] = createSignal<ThemeInfo[]>([]);
  const [data, setData] = createSignal<Record<string, unknown>>({});
  const [errors, setErrors] = createSignal<string[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal('');

  const [draft, setDraft] = createSignal<Draft>({
    type: 'post',
    title: '',
    status: 'DRAFT',
  });

  const supports = (): Set<string> =>
    new Set(types().find((t) => t.slug === draft().type)?.supports ?? ['title', 'editor']);
  const hasSupport = (support: string): boolean => supports().has(support);

  onMount(async () => {
    try {
      const [typeList, fieldTypeCatalog, themeList] = await Promise.all([
        apiClient.getContentTypes(),
        apiClient.getFieldTypes(),
        apiClient.getThemes().catch(() => [] as ThemeInfo[]),
      ]);
      setTypes(typeList);
      setFieldTypes(fieldTypeCatalog.types);
      setCategories(fieldTypeCatalog.categories);
      setThemes(themeList);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }

    // Edição: /content/edit?id=... carrega o conteúdo existente (antes dos
    // grupos de campos, para que carreguem pelo tipo real do conteúdo).
    const editId = new URLSearchParams(window.location.search).get('id');
    if (editId) {
      try {
        const existing = await apiClient.getContentById(editId);
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
    }

    // Carrega grupos de campos aplicáveis quando o tipo muda
    await loadGroups(draft().type);
  });

  // Layouts disponíveis dos temas instalados (provides.layouts), únicos
  const availableLayouts = () => {
    const layouts = new Set<string>();
    for (const theme of themes()) {
      for (const layout of theme.manifest?.provides?.layouts ?? []) layouts.add(layout);
    }
    return [...layouts].sort();
  };

  const loadGroups = async (type: string): Promise<void> => {
    try {
      // Os grupos são resolvidos por location rules no servidor:
      // o endpoint filtra por content_type quando recebemos ?type=.
      const all = await apiClient.getFieldGroups(type ? { type } : undefined);
      const resolved = await Promise.all(
        all
          .filter((group) => group.active)
          .map(async (group) => {
            const full = await apiClient.getFieldGroup(group.id);
            return full.fields ?? [];
          })
      );
      // Expande clones (seamless/group) com as mesmas regras do core
      setGroups(expandCloneFields(resolved.flat() as ResolvedFieldDefinition[]));
      void type;
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  };

  const save = async (event: Event): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setSaving(true);

    try {
      const payload = {
        ...draft(),
        layout: draft().layout || null,
        body: data(),
        ...(hasSupport('excerpt') ? {} : { excerpt: undefined }),
        ...(hasSupport('thumbnail') ? {} : { featuredImageId: undefined }),
      };

      const saved = draft().id
        ? await apiClient.updateContent(draft().id!, payload)
        : await apiClient.createContent(payload);

      setDraft({ ...draft(), id: saved.id });
      setMessage('Conteúdo salvo com sucesso.');
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form class="content-editor" onSubmit={save}>
      <Show when={errors().length > 0}>
        <For each={errors()}>
          {(err) => <div class="notice notice--error">{err}</div>}
        </For>
      </Show>
      <Show when={message()}>
        <div class="notice notice--success">{message()}</div>
      </Show>

      <div class="card">
        <label>
          Tipo
          <select
            class="input"
            value={draft().type}
            onChange={(e) => {
              setDraft({ ...draft(), type: e.currentTarget.value });
              void loadGroups(e.currentTarget.value);
            }}
          >
            <For each={types()}>
              {(type) => <option value={type.slug}>{type.pluralLabel}</option>}
            </For>
          </select>
        </label>

        <Show when={hasSupport('title')}>
          <label>
            Título
            <input
              class="input"
              required
              value={draft().title}
              onInput={(e) => setDraft({ ...draft(), title: e.currentTarget.value })}
            />
          </label>
        </Show>

        <label>
          Slug
          <input
            class="input"
            value={draft().slug ?? ''}
            onInput={(e) => setDraft({ ...draft(), slug: e.currentTarget.value })}
          />
        </label>

        <Show when={hasSupport('excerpt')}>
          <label>
            Resumo
            <textarea
              class="input"
              rows={3}
              value={draft().excerpt ?? ''}
              onInput={(e) => setDraft({ ...draft(), excerpt: e.currentTarget.value })}
            />
          </label>
        </Show>

        <Show when={hasSupport('thumbnail')}>
          <label>
            Imagem destacada (media ID)
            <input
              class="input"
              value={draft().featuredImageId ?? ''}
              onInput={(e) => setDraft({ ...draft(), featuredImageId: e.currentTarget.value })}
            />
          </label>
        </Show>

        <label>
          Status
          <select
            class="input"
            value={draft().status}
            onChange={(e) => setDraft({ ...draft(), status: e.currentTarget.value })}
          >
            <option value="DRAFT">Rascunho</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </label>

        <Show when={availableLayouts().length > 0}>
          <label>
            Layout
            <select
              class="input"
              value={draft().layout ?? ''}
              onChange={(e) => setDraft({ ...draft(), layout: e.currentTarget.value || null })}
            >
              <option value="">Automático (hierarquia do tema)</option>
              <For each={availableLayouts()}>
                {(layout) => <option value={layout}>{layout}</option>}
              </For>
            </select>
          </label>
        </Show>
      </div>

      <Show when={groups().length > 0 || fieldTypes().length > 0}>
        <div class="card custom-fields">
          <h3>Campos personalizados</h3>
          <For each={groups()}>
            {(field) => (
              <FieldRenderer
                field={field}
                values={data()}
                onChange={(name, value) => setData({ ...data(), [name]: value })}
              />
            )}
          </For>

          <details>
            <summary>Inspecionar tipos disponíveis</summary>
            <FieldTypePicker
              categories={categories()}
              types={fieldTypes()}
              value=""
              onChange={() => undefined}
            />
          </details>
        </div>
      </Show>

      <button type="submit" class="btn btn-primary" disabled={saving()}>
        Salvar
      </button>
    </form>
  );
}
