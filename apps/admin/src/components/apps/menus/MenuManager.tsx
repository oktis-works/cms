import { For, Show, createSignal, onMount } from 'solid-js';
import { apiClient, type Menu } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

interface MenuForm {
  id?: string;
  name: string;
  slug: string;
  items: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatItems(items: Menu['items']): string {
  return JSON.stringify(items ?? [], null, 2);
}

export function MenuManager() {
  const { t } = useTranslation();
  const [menus, setMenus] = createSignal<Menu[]>([]);
  const [editing, setEditing] = createSignal<MenuForm | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      setMenus(await apiClient.getMenus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  onMount(load);

  const start = (menu?: Menu): void => {
    setEditing({
      id: menu?.id,
      name: menu?.name ?? '',
      slug: menu?.slug ?? '',
      items: formatItems(menu?.items),
    });
    setError('');
    setNotice('');
  };

  const save = async (event: Event): Promise<void> => {
    event.preventDefault();
    const form = editing();
    if (!form) return;

    setSaving(true);
    setError('');
    try {
      const items = JSON.parse(form.items || '[]') as unknown;
      if (!Array.isArray(items)) throw new Error(t('menus.invalidItems'));
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        items,
      };

      if (form.id) await apiClient.updateMenu(form.id, payload);
      else await apiClient.createMenu(payload);
      setEditing(null);
      setNotice(t('menus.saved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (menu: Menu): Promise<void> => {
    if (!menu.id || !confirm(t('menus.confirmDelete', { name: menu.name }))) return;
    setError('');
    try {
      await apiClient.deleteMenu(menu.id);
      setNotice(t('menus.deleted'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="menus-manager">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <Show when={notice()}><div class="notice">{notice()}</div></Show>

      <div class="manager-toolbar">
        <p class="muted">{t('menus.hint')}</p>
        <button class="btn btn-primary" type="button" onClick={() => start()}>+ {t('menus.new')}</button>
      </div>

      <Show when={editing()}>
        {(form) => (
          <form class="card menu-form" onSubmit={save}>
            <h3>{form().id ? t('menus.edit') : t('menus.create')}</h3>
            <div class="form-grid">
              <label>
                {t('menus.name')}
                <input class="input" required value={form().name} onInput={(event) => setEditing({ ...form(), name: event.currentTarget.value })} />
              </label>
              <label>
                {t('menus.slug')}
                <input class="input" value={form().slug} onInput={(event) => setEditing({ ...form(), slug: event.currentTarget.value })} />
              </label>
            </div>
            <label>
              {t('menus.items')}
              <textarea class="input menu-items-input" rows={12} value={form().items} onInput={(event) => setEditing({ ...form(), items: event.currentTarget.value })} />
              <small class="muted">{t('menus.itemsHint')}</small>
            </label>
            <div class="form-actions">
              <button class="btn btn-primary" type="submit" disabled={saving()}>{t('common.save')}</button>
              <button class="btn" type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
            </div>
          </form>
        )}
      </Show>

      <Show when={!loading()} fallback={<div class="skeleton">{t('common.loading')}</div>}>
        <div class="card">
          <Show when={menus().length > 0} fallback={<p class="muted empty-state">{t('menus.empty')}</p>}>
            <table class="table">
              <thead><tr><th>{t('menus.name')}</th><th>{t('menus.slug')}</th><th>{t('menus.items')}</th><th /></tr></thead>
              <tbody>
                <For each={menus()}>
                  {(menu) => (
                    <tr>
                      <td>{menu.name}</td>
                      <td><code>{menu.slug}</code></td>
                      <td>{Array.isArray(menu.items) ? menu.items.length : 0}</td>
                      <td class="menu-actions">
                        <button class="btn btn-secondary btn-sm" type="button" onClick={() => start(menu)}>{t('common.edit')}</button>{' '}
                        <button class="btn btn-danger btn-sm" type="button" onClick={() => void remove(menu)}>{t('common.delete')}</button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>
      </Show>

      <style>{`
        .manager-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .manager-toolbar p { margin: 0; }
        .menu-form { display: grid; gap: 1rem; margin-bottom: 1rem; }
        .menu-form h3 { margin: 0; }
        .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        .menu-form label { display: grid; gap: 0.4rem; }
        .menu-items-input { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; }
        .form-actions { display: flex; gap: 0.5rem; }
        .empty-state { margin: 0; }
        .menu-actions { white-space: nowrap; text-align: right; }
        @media (max-width: 720px) { .manager-toolbar, .form-grid { grid-template-columns: 1fr; display: grid; } }
      `}</style>
    </div>
  );
}
