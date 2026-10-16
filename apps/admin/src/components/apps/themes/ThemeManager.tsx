import { For, Show, createSignal, onMount } from 'solid-js';
import { useTranslation } from '../../../i18n';
import { apiClient, ThemeInfo, ThemeSettingField } from '../../../lib/api';

export function ThemeManager() {
  const { t } = useTranslation();
  const [themes, setThemes] = createSignal<ThemeInfo[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [toggling, setToggling] = createSignal<string | null>(null);
  const [openConfig, setOpenConfig] = createSignal<string | null>(null);
  const [configDraft, setConfigDraft] = createSignal<Record<string, unknown>>({});
  const [configSaving, setConfigSaving] = createSignal(false);
  const [configSaved, setConfigSaved] = createSignal(false);

  onMount(async () => {
    await loadThemes();
  });

  async function loadThemes() {
    setError(null);
    try {
      setLoading(true);
      // Descoberta explícita (POST /sync — escrita) seguida da lista.
      // Sem permissão de create (ou sync falhando), degrada para a leitura
      // pura em vez de deixar a tela vazia.
      let data: ThemeInfo[];
      try {
        data = await apiClient.syncThemes();
      } catch {
        data = await apiClient.getThemes();
      }
      setThemes(data);
    } catch {
      setError(t('themes.loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(theme: ThemeInfo) {
    const wasActive = theme.status === 'ACTIVE';
    setError(null);
    setToggling(theme.id);
    try {
      const updated = wasActive
        ? await apiClient.deactivateTheme(theme.id)
        : await apiClient.activateTheme(theme.id);
      // Ativar desativa os demais no servidor — reflete em TODOS os cards.
      setThemes(
        themes().map((item) =>
          item.id === theme.id
            ? updated
            : item.status === 'ACTIVE' && updated.status === 'ACTIVE'
              ? { ...item, status: 'INACTIVE' }
              : item
        )
      );
    } catch {
      setError(wasActive ? t('themes.deactivateError') : t('themes.activateError'));
    } finally {
      setToggling(null);
    }
  }

  async function handleUninstall(theme: ThemeInfo) {
    if (!window.confirm(t('themes.confirmUninstall', { name: theme.name }))) return;
    setError(null);
    setToggling(theme.id);
    try {
      await apiClient.uninstallTheme(theme.id);
      setThemes(themes().filter((item) => item.id !== theme.id));
    } catch {
      setError(t('themes.uninstallError'));
    } finally {
      setToggling(null);
    }
  }

  /** Preview do manifesto: URL absoluta, path absoluto ou arquivo do tema. */
  function previewUrl(theme: ThemeInfo): string | null {
    const raw = theme.manifest?.preview ?? theme.manifest?.screenshots?.[0];
    if (!raw || typeof raw !== 'string') return null;
    if (/^(https?:)?\/\//.test(raw) || raw.startsWith('/')) return raw;
    return `/themes/${encodeURIComponent(theme.name)}/${raw}`;
  }

  function configFields(theme: ThemeInfo): ThemeSettingField[] {
    return (theme.manifest?.settings ?? []).filter(
      (field): field is ThemeSettingField => Boolean(field) && typeof field.name === 'string'
    );
  }

  function defaultForField(field: ThemeSettingField): unknown {
    if (field.default !== undefined) return field.default;
    if (field.type === 'checkbox') return false;
    if (field.type === 'number') return 0;
    return '';
  }

  function optionValue(option: string | { value: string; label?: string }): string {
    return typeof option === 'string' ? option : option.value;
  }

  function optionLabel(option: string | { value: string; label?: string }): string {
    return typeof option === 'string' ? option : (option.label ?? option.value);
  }

  function toggleConfig(theme: ThemeInfo) {
    if (openConfig() === theme.id) {
      setOpenConfig(null);
      return;
    }
    const draft: Record<string, unknown> = {};
    for (const field of configFields(theme)) {
      const current = theme.config?.[field.name];
      draft[field.name] = current !== undefined ? current : defaultForField(field);
    }
    setConfigDraft(draft);
    setConfigSaved(false);
    setOpenConfig(theme.id);
  }

  function setDraftValue(name: string, value: unknown) {
    setConfigDraft({ ...configDraft(), [name]: value });
  }

  async function handleSaveConfig(theme: ThemeInfo) {
    setError(null);
    setConfigSaved(false);
    setConfigSaving(true);
    try {
      const updated = await apiClient.updateThemeConfig(theme.id, configDraft());
      setThemes(themes().map((item) => (item.id === theme.id ? updated : item)));
      setConfigSaved(true);
    } catch {
      setError(t('themes.configError'));
    } finally {
      setConfigSaving(false);
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return t('themes.status.active');
      case 'INSTALLED': return t('themes.status.installed');
      case 'INACTIVE': return t('themes.status.inactive');
      default: return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'status-active';
      case 'INSTALLED': return 'status-installed';
      case 'INACTIVE': return 'status-inactive';
      default: return '';
    }
  };

  return (
    <div class="theme-manager">
      <div class="theme-toolbar">
        <p class="page-hint">{t('themes.directoryHint')}</p>
        <button class="btn btn-refresh" onClick={loadThemes} disabled={loading()}>
          {t('themes.reload')}
        </button>
      </div>

      {error() && <div class="alert alert-error">{error()}</div>}

      {loading() && <div class="skeleton">Loading...</div>}

      {!loading() && (
        <div class="themes-grid">
          <For each={themes()}>
            {(theme) => {
              const fields = configFields(theme);
              const preview = previewUrl(theme);
              return (
                <div class={`theme-card ${theme.status === 'ACTIVE' ? 'active' : ''}`}>
                  <div class="theme-preview">
                    <Show when={preview}>
                      <img
                        class="theme-preview__img"
                        src={preview!}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    </Show>
                    {theme.status === 'ACTIVE' && (
                      <div class="theme-badge active-badge">{t('themes.active')}</div>
                    )}
                  </div>
                  <div class="theme-info">
                    <h3>{theme.name}</h3>
                    <p class="theme-version">{t('themes.version')}: {theme.version}</p>
                    <p class="theme-status">
                      <span class={`status-badge ${getStatusClass(theme.status)}`}>
                        {getStatusLabel(theme.status)}
                      </span>
                    </p>
                    {theme.manifest?.description && (
                      <p class="theme-desc">{theme.manifest!.description}</p>
                    )}
                  </div>

                  <Show when={openConfig() === theme.id && fields.length > 0}>
                    <div class="config-panel">
                      <For each={fields}>
                        {(field) => (
                          <div class="config-field">
                            <label class="config-label" for={`cfg-${theme.id}-${field.name}`}>
                              {field.label || field.name}
                            </label>
                            {field.type === 'textarea' ? (
                              <textarea
                                id={`cfg-${theme.id}-${field.name}`}
                                class="input"
                                rows={3}
                                value={String(configDraft()[field.name] ?? '')}
                                onInput={(event) => setDraftValue(field.name, event.currentTarget.value)}
                              />
                            ) : field.type === 'select' ? (
                              <select
                                id={`cfg-${theme.id}-${field.name}`}
                                class="input"
                                value={String(configDraft()[field.name] ?? '')}
                                onChange={(event) => setDraftValue(field.name, event.currentTarget.value)}
                              >
                                <For each={field.options ?? []}>
                                  {(option) => (
                                    <option value={optionValue(option)}>{optionLabel(option)}</option>
                                  )}
                                </For>
                              </select>
                            ) : field.type === 'checkbox' ? (
                              <input
                                id={`cfg-${theme.id}-${field.name}`}
                                type="checkbox"
                                checked={Boolean(configDraft()[field.name])}
                                onChange={(event) => setDraftValue(field.name, event.currentTarget.checked)}
                              />
                            ) : field.type === 'color' ? (
                              <input
                                id={`cfg-${theme.id}-${field.name}`}
                                type="color"
                                class="input config-color"
                                value={String(configDraft()[field.name] ?? '#000000')}
                                onInput={(event) => setDraftValue(field.name, event.currentTarget.value)}
                              />
                            ) : (
                              <input
                                id={`cfg-${theme.id}-${field.name}`}
                                type={field.type === 'number' ? 'number' : 'text'}
                                class="input"
                                value={String(configDraft()[field.name] ?? '')}
                                onInput={(event) =>
                                  setDraftValue(
                                    field.name,
                                    field.type === 'number'
                                      ? Number(event.currentTarget.value)
                                      : event.currentTarget.value
                                  )
                                }
                              />
                            )}
                          </div>
                        )}
                      </For>
                      <div class="config-actions">
                        <button
                          class="btn"
                          onClick={() => handleSaveConfig(theme)}
                          disabled={configSaving()}
                        >
                          {t('themes.configSave')}
                        </button>
                        <Show when={configSaved()}>
                          <span class="config-saved">{t('themes.configSaved')}</span>
                        </Show>
                      </div>
                    </div>
                  </Show>

                  <div class="theme-actions">
                    <button
                      class={`btn ${toggling() === theme.id ? 'btn-loading' : ''}`}
                      onClick={() => handleToggle(theme)}
                      disabled={toggling() !== null}
                    >
                      {theme.status === 'ACTIVE'
                        ? t('themes.deactivate')
                        : t('themes.activate')}
                    </button>
                    <Show when={fields.length > 0}>
                      <button
                        class="btn btn-secondary"
                        onClick={() => toggleConfig(theme)}
                        disabled={toggling() !== null}
                      >
                        {openConfig() === theme.id
                          ? t('themes.configClose')
                          : t('themes.configTitle')}
                      </button>
                    </Show>
                    <button
                      class="btn btn-danger"
                      onClick={() => handleUninstall(theme)}
                      disabled={toggling() !== null}
                    >
                      {t('themes.uninstall')}
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
          {themes().length === 0 && <div class="empty-state">{t('themes.empty')}</div>}
        </div>
      )}

      <style>{`
        .theme-toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .page-hint {
          margin: 0;
          color: var(--color-muted);
          font-size: 0.8125rem;
        }
        .btn-refresh {
          flex-shrink: 0;
        }
        .themes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }
        .theme-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          transition: all 0.2s;
        }
        .theme-card:hover {
          border-color: var(--color-primary);
          box-shadow: var(--shadow-md);
        }
        .theme-card.active {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 1px var(--color-primary), var(--shadow-md);
        }
        .theme-preview {
          position: relative;
        }
        .theme-preview__img {
          display: block;
          width: 100%;
          border-radius: var(--radius-md);
          border: 1px solid var(--color-border);
        }
        .theme-badge {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: var(--color-primary);
          color: var(--color-primary-contrast);
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .theme-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .theme-info h3 {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 600;
        }
        .theme-version {
          margin: 0;
          font-size: 0.75rem;
          color: var(--color-muted);
        }
        .theme-desc {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--color-text);
          line-height: 1.5;
        }
        .theme-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .status-active {
          background: var(--color-success-soft);
          color: var(--color-success);
        }
        .status-installed {
          background: var(--color-primary-soft);
          color: var(--color-primary);
        }
        .status-inactive {
          background: var(--color-muted-soft);
          color: var(--color-muted);
        }
        .config-panel {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
          background: var(--color-muted-soft, rgba(0, 0, 0, 0.03));
          border-radius: var(--radius-md);
        }
        .config-field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .config-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text);
        }
        .config-color {
          height: 2.25rem;
          padding: 0.15rem;
        }
        .config-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .config-saved {
          font-size: 0.75rem;
          color: var(--color-success);
        }
        .theme-actions {
          margin-top: 0.5rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .btn-secondary {
          background: transparent;
          color: var(--color-text);
          border: 1px solid var(--color-border);
        }
        .btn-danger {
          background: transparent;
          color: var(--color-error);
          border: 1px solid var(--color-error);
        }
        .empty-state {
          grid-column: 1 / -1;
          padding: 3rem;
          text-align: center;
          color: var(--color-muted);
        }
        .alert {
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
          margin-bottom: 1rem;
        }
        .alert-error {
          background: var(--color-error-soft);
          color: var(--color-error);
          border: 1px solid var(--color-error);
        }
        .skeleton {
          padding: 2rem;
          text-align: center;
          color: var(--color-muted);
        }
      `}</style>
    </div>
  );
}
