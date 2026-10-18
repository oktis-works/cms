// @oktis-works/admin - PermissionPicker (matriz recurso × ação, multi-seleção)
//
// Substitui o campo de texto livre de permissões por uma matriz de checkboxes:
// linhas são os recursos que a API realmente protege (`requirePermission`),
// colunas são as ações. Strings fora do vocabulário (permissões personalizadas
// gravadas em roles antigas) aparecem como chips removíveis — nada se perde.
//
// O painel usa o FloatingPanel (portal + position: fixed), então o `overflow`
// de card/formulário/modal jamais o corta.

import { For, Show, createMemo, createSignal } from 'solid-js';
import { FloatingPanel } from '../../ui/FloatingPanel';
import { useTranslation } from '../../../i18n';

export interface PermissionPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  searchPlaceholder?: string;
  placeholder?: string;
}

/** Ações canônicas (o que `requirePermission(action, resource)` recebe). */
const ACTIONS = ['read', 'create', 'update', 'delete'] as const;

/** Recursos protegidos pela API, na ordem em que aparecem na matriz. */
const RESOURCES = [
  'content',
  'media',
  'category',
  'tag',
  'menu',
  'user',
  'roles',
  'theme',
  'plugin',
  'setting',
  'webhook',
  'tenants',
  'audit',
  'build',
  'system',
] as const;

/** Ação extra por recurso (fora do padrão read/create/update/delete). */
const EXTRA_ACTIONS: Record<string, readonly string[]> = { media: ['upload'] };

const permissionKey = (action: string, resource: string): string => `${action}:${resource}`;

const isKnown = (token: string): boolean => {
  const [action, resource] = token.split(':');
  if (!action || !resource) return false;
  return (
    (ACTIONS as readonly string[]).includes(action) &&
    (RESOURCES as readonly string[]).includes(resource)
  );
};

export function PermissionPicker(props: PermissionPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [customDraft, setCustomDraft] = createSignal('');
  const [trigger, setTrigger] = createSignal<HTMLButtonElement | undefined>(undefined);

  const selected = createMemo(() => new Set(props.value));
  const custom = createMemo(() => props.value.filter((token) => !isKnown(token)));

  const filteredResources = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return RESOURCES as readonly string[];
    return RESOURCES.filter(
      (resource) =>
        resource.includes(q) || t(`access.resources.${resource}`).toLowerCase().includes(q),
    );
  });

  /** Colunas extras visíveis (ex.: upload quando "media" está no filtro). */
  const extraColumns = createMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const resource of filteredResources()) {
      for (const action of EXTRA_ACTIONS[resource] ?? []) seen.add(action);
    }
    return [...seen];
  });

  /** Coluna completa para o par (ação, recurso)? */
  const hasColumn = (action: string, resource: string): boolean =>
    (ACTIONS as readonly string[]).includes(action) ||
    (EXTRA_ACTIONS[resource] ?? []).includes(action);

  const toggle = (action: string, resource: string): void => {
    const key = permissionKey(action, resource);
    props.onChange(
      selected().has(key) ? props.value.filter((token) => token !== key) : [...props.value, key],
    );
  };

  const removeToken = (token: string): void => {
    props.onChange(props.value.filter((value) => value !== token));
  };

  const addCustom = (): void => {
    const token = customDraft().trim().toLowerCase().replace(/\s+/g, '-');
    if (token && !selected().has(token)) props.onChange([...props.value, token]);
    setCustomDraft('');
  };

  const summary = (): string => {
    const count = props.value.length;
    if (count === 0) return props.placeholder ?? t('access.permissionsPlaceholder');
    const resources = new Set(props.value.map((token) => token.split(':')[1] ?? token));
    return t('access.permissionsSummary', { resources: resources.size, count });
  };

  return (
    <div class="permission-picker">
      <button
        type="button"
        class="input permission-picker__trigger"
        aria-haspopup="dialog"
        aria-expanded={open()}
        ref={setTrigger}
        onClick={() => setOpen(!open())}
      >
        <span classList={{ 'permission-picker__value': true, 'is-empty': props.value.length === 0 }}>
          {summary()}
        </span>
        <span class="icon-picker__caret" aria-hidden="true">{open() ? '▴' : '▾'}</span>
      </button>

      <FloatingPanel
        open={open()}
        trigger={trigger()}
        onClose={() => setOpen(false)}
        class="permission-picker__panel"
        role="dialog"
        aria-label={t('access.permissions')}
        minWidth={440}
      >
        <input
          type="search"
          class="input permission-picker__search"
          placeholder={props.searchPlaceholder ?? t('access.permissionSearch')}
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />

        <div class="permission-picker__matrix" role="presentation">
          <div class="permission-picker__row permission-picker__row--head" role="presentation">
            <span class="permission-picker__resource" />
            <For each={ACTIONS as readonly string[]}>
              {(action) => <span class="permission-picker__action-label">{action}</span>}
            </For>
            <For each={extraColumns()}>
              {(action) => <span class="permission-picker__action-label">{action}</span>}
            </For>
          </div>

          <For
            each={filteredResources()}
            fallback={<p class="permission-picker__empty">{t('access.permissionNoMatches')}</p>}
          >
            {(resource) => (
              <div class="permission-picker__row">
                <span class="permission-picker__resource" title={resource}>
                  {t(`access.resources.${resource}`)}
                </span>
                <For each={[...(ACTIONS as readonly string[]), ...extraColumns()]}>
                  {(action) =>
                    hasColumn(action, resource) ? (
                      <label
                        class="permission-picker__cell"
                        title={`${action}:${resource}`}
                        classList={{ 'is-checked': selected().has(permissionKey(action, resource)) }}
                      >
                        <input
                          type="checkbox"
                          checked={selected().has(permissionKey(action, resource))}
                          onChange={() => toggle(action, resource)}
                        />
                        <span aria-hidden="true">✓</span>
                      </label>
                    ) : (
                      <span class="permission-picker__cell permission-picker__cell--empty" />
                    )
                  }
                </For>
              </div>
            )}
          </For>
        </div>

        <div class="permission-picker__custom">
          <p class="permission-picker__custom-label">{t('access.customPermissions')}</p>
          <div class="permission-picker__chips">
            <For each={custom()}>
              {(token) => (
                <span class="permission-picker__chip">
                  <code>{token}</code>
                  <button
                    type="button"
                    aria-label={`${t('common.remove')}: ${token}`}
                    onClick={() => removeToken(token)}
                  >
                    ×
                  </button>
                </span>
              )}
            </For>
            <form
              class="permission-picker__custom-form"
              onSubmit={(event) => {
                event.preventDefault();
                addCustom();
              }}
            >
              <input
                class="input permission-picker__custom-input"
                placeholder={t('access.customPermission')}
                value={customDraft()}
                onInput={(event) => setCustomDraft(event.currentTarget.value)}
              />
              <button class="btn btn-secondary btn-sm" type="submit">
                {t('common.add')}
              </button>
            </form>
          </div>
        </div>

        <Show when={props.value.length > 0}>
          <p class="icon-picker__count">
            {t('access.permissionsSelected', { count: props.value.length })}
          </p>
        </Show>
      </FloatingPanel>
    </div>
  );
}
