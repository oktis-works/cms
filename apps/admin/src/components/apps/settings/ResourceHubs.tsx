import { For, Show, createSignal, onMount } from 'solid-js';
import {
  apiClient,
  type Build,
  type Category,
  type Deployment,
  type Menu,
  type Role,
  type Tag,
  type Taxonomy,
  type TaxonomyTerm,
  type Tenant,
  type Webhook,
} from '../../../lib/api';
import { useTranslation } from '../../../i18n';

type Kind = 'category' | 'tag' | 'menu';

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function ContentResourcesManager() {
  const { t } = useTranslation();
  const [kind, setKind] = createSignal<Kind>('category');
  const [categories, setCategories] = createSignal<Category[]>([]);
  const [tags, setTags] = createSignal<Tag[]>([]);
  const [menus, setMenus] = createSignal<Menu[]>([]);
  const [taxonomies, setTaxonomies] = createSignal<Taxonomy[]>([]);
  const [terms, setTerms] = createSignal<TaxonomyTerm[]>([]);
  const [taxonomySlug, setTaxonomySlug] = createSignal('');
  const [editing, setEditing] = createSignal<{ id?: string; name: string; slug: string; description?: string; items?: string } | null>(null);
  const [termEditing, setTermEditing] = createSignal<{ id?: string; name: string; slug: string; description?: string } | null>(null);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');

  const load = async (): Promise<void> => {
    try {
      const [categoryList, tagList, menuList, taxonomyList] = await Promise.all([
        apiClient.getCategories(),
        apiClient.getTags(),
        apiClient.getMenus(),
        apiClient.getTaxonomies(),
      ]);
      setCategories(categoryList);
      setTags(tagList);
      setMenus(menuList);
      setTaxonomies(taxonomyList);
      if (!taxonomySlug() && taxonomyList[0]) {
        setTaxonomySlug(taxonomyList[0].slug);
        setTerms(await apiClient.getTaxonomyTerms(taxonomyList[0].slug));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  onMount(load);

  const loadTerms = async (slug: string): Promise<void> => {
    setTaxonomySlug(slug);
    if (!slug) {
      setTerms([]);
      return;
    }
    try {
      setTerms(await apiClient.getTaxonomyTerms(slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const start = (nextKind: Kind, item?: Category | Tag | Menu): void => {
    setKind(nextKind);
    if (nextKind === 'menu') {
      const menu = item as Menu | undefined;
      setEditing({ id: menu?.id, name: menu?.name ?? '', slug: menu?.slug ?? '', items: JSON.stringify(menu?.items ?? [], null, 2) });
    } else {
      const row = item as Category | Tag | undefined;
      setEditing({ id: row?.id, name: row?.name ?? '', slug: row?.slug ?? '', description: 'description' in (row ?? {}) ? String((row as Category).description ?? '') : undefined });
    }
    setError('');
    setNotice('');
  };

  const save = async (event: Event): Promise<void> => {
    event.preventDefault();
    const form = editing();
    if (!form) return;
    setError('');
    try {
      const slug = form.slug || slugify(form.name);
      if (kind() === 'category') {
        const payload = { name: form.name, slug, description: form.description };
        if (form.id) await apiClient.updateCategory(form.id, payload);
        else await apiClient.createCategory(payload);
      } else if (kind() === 'tag') {
        const payload = { name: form.name, slug };
        if (form.id) await apiClient.updateTag(form.id, payload);
        else await apiClient.createTag(payload);
      } else {
        const items = JSON.parse(form.items || '[]') as unknown[];
        const payload = { name: form.name, slug, items };
        if (form.id) await apiClient.updateMenu(form.id, payload);
        else await apiClient.createMenu(payload);
      }
      setEditing(null);
      setNotice(t('resources.saved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (item: Category | Tag | Menu): Promise<void> => {
    if (!confirm(t('resources.confirmDelete'))) return;
    try {
      if (kind() === 'category' && item.id) await apiClient.deleteCategory(item.id);
      if (kind() === 'tag' && item.id) await apiClient.deleteTag(item.id);
      if (kind() === 'menu' && item.id) await apiClient.deleteMenu(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveTerm = async (event: Event): Promise<void> => {
    event.preventDefault();
    const form = termEditing();
    const taxonomy = taxonomySlug();
    if (!form || !taxonomy) return;
    try {
      if (form.id) await apiClient.updateTaxonomyTerm(taxonomy, form.id, { name: form.name, slug: form.slug || slugify(form.name), description: form.description });
      else await apiClient.createTaxonomyTerm(taxonomy, { name: form.name, slug: form.slug || slugify(form.name), description: form.description });
      setTermEditing(null);
      await loadTerms(taxonomy);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="resource-hub">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <Show when={notice()}><div class="notice">{notice()}</div></Show>
      <div class="resource-tabs">
        <For each={['category', 'tag', 'menu'] as Kind[]}>
          {(value) => <button type="button" class="btn" classList={{ 'btn-primary': kind() === value }} onClick={() => { setKind(value); setEditing(null); }}>{t(`resources.tabs.${value}`)}</button>}
        </For>
      </div>
      <Show when={editing()}>
        {(form) => (
          <form class="card resource-form" onSubmit={save}>
            <h3>{t(`resources.form.${form().id ? 'edit' : 'new'}`)}</h3>
            <label>{t('resources.name')}<input class="input" required value={form().name} onInput={(event) => setEditing({ ...form(), name: event.currentTarget.value })} /></label>
            <label>{t('resources.slug')}<input class="input" value={form().slug} onInput={(event) => setEditing({ ...form(), slug: event.currentTarget.value })} /></label>
            <Show when={kind() === 'category'}><label>{t('resources.description')}<textarea class="input" value={form().description ?? ''} onInput={(event) => setEditing({ ...form(), description: event.currentTarget.value })} /></label></Show>
            <Show when={kind() === 'menu'}><label>{t('resources.items')}<textarea class="input" rows={8} value={form().items ?? '[]'} onInput={(event) => setEditing({ ...form(), items: event.currentTarget.value })} /></label></Show>
            <div><button class="btn btn-primary" type="submit">{t('common.save')}</button>{' '}<button class="btn" type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button></div>
          </form>
        )}
      </Show>
      <div class="resource-actions"><button type="button" class="btn btn-primary" onClick={() => start(kind())}>+ {t('resources.new')}</button></div>
      <div class="card">
        <Show when={kind() === 'category'}>
          <table class="table"><thead><tr><th>{t('resources.name')}</th><th>{t('resources.slug')}</th><th /></tr></thead><tbody><For each={categories()}>{(item) => <tr><td>{item.name}</td><td>{item.slug}</td><td><button class="btn" type="button" onClick={() => start('category', item)}>{t('common.edit')}</button>{' '}<button class="btn btn-danger" type="button" onClick={() => void remove(item)}>{t('common.delete')}</button></td></tr>}</For></tbody></table>
        </Show>
        <Show when={kind() === 'tag'}>
          <table class="table"><thead><tr><th>{t('resources.name')}</th><th>{t('resources.slug')}</th><th /></tr></thead><tbody><For each={tags()}>{(item) => <tr><td>{item.name}</td><td>{item.slug}</td><td><button class="btn" type="button" onClick={() => start('tag', item)}>{t('common.edit')}</button>{' '}<button class="btn btn-danger" type="button" onClick={() => void remove(item)}>{t('common.delete')}</button></td></tr>}</For></tbody></table>
        </Show>
        <Show when={kind() === 'menu'}>
          <table class="table"><thead><tr><th>{t('resources.name')}</th><th>{t('resources.slug')}</th><th /></tr></thead><tbody><For each={menus()}>{(item) => <tr><td>{item.name}</td><td>{item.slug}</td><td><button class="btn" type="button" onClick={() => start('menu', item)}>{t('common.edit')}</button>{' '}<button class="btn btn-danger" type="button" onClick={() => void remove(item)}>{t('common.delete')}</button></td></tr>}</For></tbody></table>
        </Show>
      </div>
      <section class="card terms-panel">
        <h3>{t('resources.terms.title')}</h3>
        <select class="input" value={taxonomySlug()} onChange={(event) => void loadTerms(event.currentTarget.value)}><option value="">{t('resources.terms.choose')}</option><For each={taxonomies()}>{(taxonomy) => <option value={taxonomy.slug}>{taxonomy.name}</option>}</For></select>
        <Show when={taxonomySlug()}>
          <button class="btn btn-primary" type="button" onClick={() => setTermEditing({ name: '', slug: '', description: '' })}>+ {t('resources.terms.new')}</button>
          <Show when={termEditing()}>{(form) => <form class="term-form" onSubmit={saveTerm}><input class="input" required placeholder={t('resources.name')} value={form().name} onInput={(event) => setTermEditing({ ...form(), name: event.currentTarget.value })} /><input class="input" placeholder={t('resources.slug')} value={form().slug} onInput={(event) => setTermEditing({ ...form(), slug: event.currentTarget.value })} /><button class="btn" type="submit">{t('common.save')}</button></form>}</Show>
          <table class="table"><thead><tr><th>{t('resources.name')}</th><th>{t('resources.slug')}</th><th /></tr></thead><tbody><For each={terms()}>{(term) => <tr><td>{term.name}</td><td>{term.slug}</td><td><button class="btn" type="button" onClick={() => setTermEditing({ id: term.id, name: term.name, slug: term.slug, description: term.description ?? '' })}>{t('common.edit')}</button><button class="btn btn-danger" type="button" onClick={() => term.id && void apiClient.deleteTaxonomyTerm(taxonomySlug(), term.id).then(() => loadTerms(taxonomySlug()))}>{t('common.delete')}</button></td></tr>}</For></tbody></table>
        </Show>
      </section>
    </div>
  );
}

export function AccessManager() {
  const { t } = useTranslation();
  const [roles, setRoles] = createSignal<Role[]>([]);
  const [tenants, setTenants] = createSignal<Tenant[]>([]);
  const [editingRole, setEditingRole] = createSignal<Partial<Role> | null>(null);
  const [editingTenant, setEditingTenant] = createSignal<Partial<Tenant> | null>(null);
  const [error, setError] = createSignal('');
  const load = async (): Promise<void> => {
    try { setRoles(await apiClient.listRoles()); setTenants((await apiClient.listTenants({ limit: 100 })).data ?? []); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  onMount(load);
  return <div class="resource-hub"><Show when={error()}><div class="notice notice--error">{error()}</div></Show><div class="access-grid"><section class="card"><h3>{t('access.roles')}</h3><button class="btn btn-primary" type="button" onClick={() => setEditingRole({ name: '', slug: '', permissions: [] })}>+ {t('common.create')}</button><Show when={editingRole()}>{(role) => <form class="resource-form" onSubmit={(event) => { event.preventDefault(); void (role().id ? apiClient.updateRole(role().id!, role()) : apiClient.createRole(role())).then(() => { setEditingRole(null); return load(); }).catch((err) => setError(err instanceof Error ? err.message : String(err))); }}><input class="input" required placeholder={t('resources.name')} value={role().name ?? ''} onInput={(event) => setEditingRole({ ...role(), name: event.currentTarget.value })} /><input class="input" required placeholder={t('resources.slug')} value={role().slug ?? ''} onInput={(event) => setEditingRole({ ...role(), slug: event.currentTarget.value })} /><input class="input" placeholder={t('access.permissions')} value={(role().permissions ?? []).join(', ')} onInput={(event) => setEditingRole({ ...role(), permissions: event.currentTarget.value.split(',').map((value) => value.trim()).filter(Boolean) })} /><button class="btn btn-primary" type="submit">{t('common.save')}</button></form>}</Show><table class="table"><tbody><For each={roles()}>{(role) => <tr><td>{role.name}</td><td>{role.slug}</td><td><button class="btn" type="button" onClick={() => setEditingRole(role)}>{t('common.edit')}</button><Show when={!role.is_system}><button class="btn btn-danger" type="button" onClick={() => void apiClient.deleteRole(role.id).then(load)}>{t('common.delete')}</button></Show></td></tr>}</For></tbody></table></section><section class="card"><h3>{t('access.tenants')}</h3><button class="btn btn-primary" type="button" onClick={() => setEditingTenant({ name: '', slug: '' })}>+ {t('common.create')}</button><Show when={editingTenant()}>{(tenant) => <form class="resource-form" onSubmit={(event) => { event.preventDefault(); void (tenant().id ? apiClient.updateTenant(tenant().id!, tenant()) : apiClient.createTenant(tenant())).then(() => { setEditingTenant(null); return load(); }).catch((err) => setError(err instanceof Error ? err.message : String(err))); }}><input class="input" required placeholder={t('resources.name')} value={tenant().name ?? ''} onInput={(event) => setEditingTenant({ ...tenant(), name: event.currentTarget.value })} /><input class="input" required placeholder={t('resources.slug')} value={tenant().slug ?? ''} onInput={(event) => setEditingTenant({ ...tenant(), slug: event.currentTarget.value })} /><input class="input" placeholder={t('access.domain')} value={tenant().domain ?? ''} onInput={(event) => setEditingTenant({ ...tenant(), domain: event.currentTarget.value })} /><button class="btn btn-primary" type="submit">{t('common.save')}</button></form>}</Show><table class="table"><tbody><For each={tenants()}>{(tenant) => <tr><td>{tenant.name}</td><td>{tenant.slug}</td><td>{tenant.status}</td><td><button class="btn" type="button" onClick={() => setEditingTenant(tenant)}>{t('common.edit')}</button><button class="btn btn-danger" type="button" onClick={() => tenant.id && void apiClient.deleteTenant(tenant.id).then(load)}>{t('common.delete')}</button></td></tr>}</For></tbody></table></section></div></div>;
}

export function OperationsManager() {
  const { t } = useTranslation();
  const [webhooks, setWebhooks] = createSignal<Webhook[]>([]);
  const [builds, setBuilds] = createSignal<Build[]>([]);
  const [deployments, setDeployments] = createSignal<Deployment[]>([]);
  const [events, setEvents] = createSignal<Record<string, unknown>[]>([]);
  const [error, setError] = createSignal('');
  const [webhook, setWebhook] = createSignal<Partial<Webhook> | null>(null);
  const load = async (): Promise<void> => {
    try {
      const [hooks, buildList, deploymentList, eventList] = await Promise.all([apiClient.getWebhooks(), apiClient.getBuilds({ limit: 20 }), apiClient.getDeployments({ limit: 20 }), apiClient.getEvents({ limit: 20 })]);
      setWebhooks(hooks); setBuilds(buildList.data ?? []); setDeployments(deploymentList.data ?? []); setEvents(eventList.data ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  onMount(load);
  const deployBuild = async (build: Build): Promise<void> => {
    if (!build.id || !build.checksum) return;
    try {
      const theme = build.theme ?? { name: 'default', version: '0.0.0' };
      await apiClient.createDeployment({
        buildId: build.id,
        core_version: build.coreVersion ?? build.core_version ?? 'unknown',
        theme_version: theme.version,
        plugin_versions: build.plugins ?? {},
        checksum: build.checksum,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="resource-hub">
      <Show when={error()}><div class="notice notice--error">{error()}</div></Show>
      <section class="card">
        <h3>{t('operations.webhooks')}</h3>
        <button class="btn btn-primary" type="button" onClick={() => setWebhook({ url: '', events: [], secret: '', active: true })}>+ {t('common.create')}</button>
        <Show when={webhook()}>{(form) => <form class="resource-form" onSubmit={(event) => { event.preventDefault(); void (form().id ? apiClient.updateWebhook(form().id!, form()) : apiClient.createWebhook(form())).then(() => { setWebhook(null); return load(); }).catch((err) => setError(err instanceof Error ? err.message : String(err))); }}>
          <input class="input" required type="url" placeholder="https://example.com/webhook" value={form().url ?? ''} onInput={(event) => setWebhook({ ...form(), url: event.currentTarget.value })} />
          <input class="input" placeholder={t('operations.events')} value={(form().events ?? []).join(', ')} onInput={(event) => setWebhook({ ...form(), events: event.currentTarget.value.split(',').map((value) => value.trim()).filter(Boolean) })} />
          <input class="input" placeholder={t('operations.secret')} value={form().secret ?? ''} onInput={(event) => setWebhook({ ...form(), secret: event.currentTarget.value })} />
          <button class="btn btn-primary" type="submit">{t('common.save')}</button>
        </form>}</Show>
        <table class="table"><tbody><For each={webhooks()}>{(hook) => <tr><td>{hook.url}</td><td>{(hook.events ?? []).join(', ')}</td><td><button class="btn" type="button" onClick={() => setWebhook(hook)}>{t('common.edit')}</button>{' '}<button class="btn btn-danger" type="button" onClick={() => hook.id && void apiClient.deleteWebhook(hook.id).then(load)}>{t('common.delete')}</button></td></tr>}</For></tbody></table>
      </section>
      <section class="card">
        <h3>{t('operations.builds')}</h3>
        <button class="btn btn-primary" type="button" onClick={() => void apiClient.createBuild({ plugins: {}, theme: { name: 'default', version: '0.0.0' } }).then(load).catch((err) => setError(err instanceof Error ? err.message : String(err)))}>{t('operations.createBuild')}</button>
        <table class="table"><tbody><For each={builds()}>{(build) => <tr><td>{build.id}</td><td>{build.status}</td><td>{build.error}</td><td><Show when={build.status === 'COMPLETED' && build.checksum}><button class="btn btn-primary" type="button" onClick={() => void deployBuild(build)}>{t('operations.deploy')}</button></Show></td></tr>}</For></tbody></table>
      </section>
      <section class="card">
        <h3>{t('operations.deployments')}</h3>
        <table class="table"><tbody><For each={deployments()}>{(deployment) => <tr><td>{deployment.id}</td><td>{deployment.status}</td><td>{deployment.build_id}</td></tr>}</For></tbody></table>
      </section>
      <section class="card">
        <h3>{t('operations.events')}</h3>
        <table class="table"><tbody><For each={events()}>{(event) => <tr><td>{String(event['type'] ?? '')}</td><td>{String(event['created_at'] ?? '')}</td></tr>}</For></tbody></table>
      </section>
    </div>
  );
}
