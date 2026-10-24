// @oktis-works/admin - Theme Customizer (Item 7 — live preview via ?preview_settings)
//
// Form driven by the active theme's manifest.settings with a live preview
// iframe. The preview overlays the draft over the saved theme config through
// the `?preview_settings` query param (web-side, request-only — nothing is
// persisted until "Save"). Save writes the config via PATCH /themes/:id/config.

import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { useTranslation } from '../../../i18n';
import { apiClient, type ThemeInfo, type ThemeSettingField } from '../../../lib/api';
import { FieldRendererFactory, type CustomFieldConfig } from '../../shared/FieldRendererFactory';

const PREVIEW_DEBOUNCE_MS = 800;

function defaultForField(field: ThemeSettingField): unknown {
  if (field.default !== undefined) return field.default;
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return 0;
  return '';
}

/** Converte ThemeSettingField para CustomFieldConfig */
function toCustomFieldConfig(field: ThemeSettingField): CustomFieldConfig {
  const f = field as any; // Use any to access extended properties safely
  return {
    name: field.name,
    type: field.type ?? 'text',
    label: field.label,
    default: field.default,
    options: field.options as CustomFieldConfig['options'],
    required: field.required,
    placeholder: field.placeholder,
    min: field.min as number | undefined,
    max: field.max as number | undefined,
    step: field.step as number | undefined,
    minLength: field.minLength as number | undefined,
    maxLength: field.maxLength as number | undefined,
    pattern: field.pattern,
    postType: f.postType as string | undefined,
    multiple: f.multiple as boolean | undefined,
    accept: f.accept as string | undefined,
    entityType: f.entityType as 'taxonomy' | 'user' | undefined,
    taxonomy: f.taxonomy as string | undefined,
    itemLabel: f.itemLabel as string | undefined,
    minRows: f.minRows as number | undefined,
    maxRows: f.maxRows as number | undefined,
    collapsible: f.collapsible as boolean | undefined,
    defaultExpanded: f.defaultExpanded as boolean | undefined,
    subFields: field.subFields?.map(toCustomFieldConfig),
    layouts: field.layouts?.map((l) => ({
      name: l.name,
      label: l.label,
      subFields: l.subFields?.map(toCustomFieldConfig) || [],
    })),
  };
}

/** Extrai o themeId da query string ?theme=<id> */
function getThemeIdFromQuery(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('theme');
}

export function ThemeCustomizer() {
  const { t } = useTranslation();
  const [themes, setThemes] = createSignal<ThemeInfo[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal<Record<string, unknown>>({});
  const [savedConfig, setSavedConfig] = createSignal<Record<string, unknown>>({});
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [previewPath, setPreviewPath] = createSignal('/');
  const [previewNonce, setPreviewNonce] = createSignal(0);
  const [selectedThemeId, setSelectedThemeId] = createSignal<string | null>(null);

  let debounceHandle: ReturnType<typeof setTimeout> | null = null;

  // Tema selecionado: via query param ?theme=<id> ou tema ativo como fallback
  const selectedTheme = createMemo(() => {
    const id = selectedThemeId();
    if (id) return themes().find((t) => t.id === id) ?? null;
    return themes().find((theme) => theme.status === 'ACTIVE') ?? null;
  });
  
  const fields = createMemo(() =>
    (selectedTheme()?.manifest?.settings ?? []).filter(
      (field): field is ThemeSettingField => Boolean(field) && typeof field.name === 'string'
    )
  );
  const dirty = createMemo(() => JSON.stringify(draft()) !== JSON.stringify(savedConfig()));

  onMount(async () => {
    // Check for theme ID in query params
    const queryThemeId = getThemeIdFromQuery();
    if (queryThemeId) setSelectedThemeId(queryThemeId);
    await load();
  });

  async function load() {
    setError(null);
    try {
      setLoading(true);
      const data = await apiClient.getThemes();
      setThemes(data);
      
      // Determine which theme to customize
      let targetTheme = data.find((t) => t.id === selectedThemeId()) ?? null;
      if (!targetTheme) {
        targetTheme = data.find((theme) => theme.status === 'ACTIVE') ?? null;
      }
      
      if (!targetTheme) {
        setError(t('customizer.noTheme'));
        return;
      }
      
      setSelectedThemeId(targetTheme.id);
      
      const config = (targetTheme.config ?? {}) as Record<string, unknown>;
      setSavedConfig(config);
      const initial: Record<string, unknown> = {};
      for (const field of targetTheme.manifest?.settings ?? []) {
        initial[field.name] = config[field.name] !== undefined ? config[field.name] : defaultForField(field);
      }
      setDraft(initial);
    } catch {
      setError(t('customizer.loadError'));
    } finally {
      setLoading(false);
    }
  }

  function setDraftValue(name: string, value: unknown): void {
    setDraft({ ...draft(), [name]: value });
    setSaved(false);
    schedulePreview();
  }

  /** Debounced iframe reload — typing re-renders the preview without spamming. */
  function schedulePreview(): void {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => setPreviewNonce((nonce) => nonce + 1), PREVIEW_DEBOUNCE_MS);
  }

  function refreshPreviewNow(): void {
    if (debounceHandle) clearTimeout(debounceHandle);
    setPreviewNonce((nonce) => nonce + 1);
  }

  function resetDraft(): void {
    setDraft({ ...savedConfig() });
    setSaved(false);
    refreshPreviewNow();
  }

  async function save(): Promise<void> {
    const theme = selectedTheme();
    if (!theme) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await apiClient.updateThemeConfig(theme.id, draft());
      setThemes(themes().map((item) => (item.id === theme.id ? updated : item)));
      setSavedConfig({ ...draft() });
      setSaved(true);
    } catch {
      setError(t('customizer.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const previewUrl = (): string => {
    const base = previewPath() || '/';
    const encoded = encodeURIComponent(JSON.stringify(draft()));
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}preview_settings=${encoded}&_=${previewNonce()}`;
  };

  return (
    <div class="customizer">
      <Show when={!loading()} fallback={<div class="skeleton">Loading...</div>}>
        <Show
          when={selectedTheme()}
          fallback={
            <div class="empty-state">
              {t('customizer.noTheme')}{' '}
              <a class="btn btn-secondary" href="/themes">{t('customizer.goToThemes')}</a>
            </div>
          }
        >
          <div class="customizer__layout">
            <aside class="customizer__panel">
              <h3>{selectedTheme()!.name} · {t('customizer.title')}</h3>

              <Show when={fields().length === 0}>
                <p class="muted">{t('customizer.noSettings')}</p>
              </Show>

              <For each={fields()}>
                {(field) => {
                  const config = toCustomFieldConfig(field);
                  return (
                    <div class="customizer__field" key={field.name}>
                      <label for={`customizer-${field.name}`}>{field.label || field.name}</label>
                      <FieldRendererFactory
                        field={config}
                        value={draft()[field.name]}
                        onChange={(val) => setDraftValue(field.name, val)}
                      />
                    </div>
                  );
                }}
              </For>

              <div class="customizer__actions">
                <button class="btn btn-primary" onClick={save} disabled={saving() || !dirty()}>
                  {saving() ? t('customizer.saving') : t('customizer.save')}
                </button>
                <button class="btn btn-secondary" onClick={resetDraft} disabled={!dirty()}>
                  {t('customizer.reset')}
                </button>
                <button class="btn btn-secondary" onClick={refreshPreviewNow}>
                  {t('customizer.refreshPreview')}
                </button>
              </div>
              <Show when={saved()}>
                <span class="customizer__saved">{t('customizer.saved')}</span>
              </Show>
              <Show when={error()}>
                <div class="alert alert-error">{error()}</div>
              </Show>
              <p class="muted customizer__hint">{t('customizer.previewHint')}</p>
            </aside>

            <section class="customizer__preview">
              <div class="customizer__preview-bar">
                <input
                  class="input"
                  value={previewPath()}
                  placeholder="/"
                  aria-label={t('customizer.previewPath')}
                  onChange={(event) => {
                    setPreviewPath(event.currentTarget.value || '/');
                    refreshPreviewNow();
                  }}
                />
              </div>
              <iframe class="customizer__frame" title={t('customizer.previewTitle')} src={previewUrl()} />
            </section>
          </div>
        </Show>
      </Show>

      <style>{`
        .customizer__layout {
          display: grid;
          grid-template-columns: minmax(280px, 340px) 1fr;
          gap: 1.25rem;
          align-items: start;
        }
        .customizer__panel {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          position: sticky;
          top: 1rem;
        }
        .customizer__panel h3 { margin: 0; font-size: 1rem; }
        .customizer__field { display: flex; flex-direction: column; gap: 0.3rem; }
        .customizer__field label { font-size: 0.75rem; font-weight: 600; color: var(--color-text); }
        .customizer__color { height: 2.25rem; padding: 0.15rem; }
        .customizer__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .customizer__saved { font-size: 0.75rem; color: var(--color-success); }
        .customizer__hint { font-size: 0.75rem; margin: 0; }
        .customizer__preview {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 0;
        }
        .customizer__preview-bar { display: flex; gap: 0.5rem; }
        .customizer__frame {
          width: 100%;
          height: min(72vh, 780px);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-white);
        }
        .alert-error {
          background: var(--color-error-soft);
          color: var(--color-error);
          border: 1px solid var(--color-error);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
        }
        .empty-state { padding: 3rem; text-align: center; color: var(--color-muted); }
        .skeleton { padding: 2rem; text-align: center; color: var(--color-muted); }
      `}</style>
    </div>
  );
}
