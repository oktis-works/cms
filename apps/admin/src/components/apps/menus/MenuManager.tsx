import { For, Show, createMemo, createSignal, onMount, type JSX } from 'solid-js';
import { apiClient, type Content, type ContentType, type Menu, type MenuItem, type MenuItemType, type MenuSettings, type Taxonomy, type TaxonomyTerm } from '../../../lib/api';
import { useTranslation } from '../../../i18n';

interface MenuDraftItem extends MenuItem { clientId: string; children: MenuDraftItem[]; }
interface MenuForm { id?: string; name: string; slug: string; items: MenuDraftItem[]; settings: MenuSettings; }
interface LinkCandidate { id: string; type: MenuItemType; label: string; url: string; objectId?: string; objectType?: string; }

function makeId(prefix: string): string {
  const random = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function itemFromApi(item: MenuItem, parentId: string | null = null): MenuDraftItem {
  const id = item.id || makeId('item');
  return { ...item, id, clientId: id, parentId: parentId ?? item.parentId ?? null, children: [] };
}

function toTree(items: MenuItem[] | undefined): MenuDraftItem[] {
  const flat = (Array.isArray(items) ? items : []).map((item) => itemFromApi(item));
  const byId = new Map(flat.map((item) => [item.id, item]));
  const roots: MenuDraftItem[] = [];
  for (const item of flat) {
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (parent && parent.id !== item.id) parent.children.push(item); else roots.push(item);
  }
  const sort = (list: MenuDraftItem[]): MenuDraftItem[] => { list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); list.forEach((item) => sort(item.children)); return list; };
  return sort(roots);
}

function flattenTree(items: MenuDraftItem[], parentId: string | null = null): MenuItem[] {
  const result: MenuItem[] = [];
  items.forEach((item, index) => {
    const { clientId: _clientId, children, ...payload } = item;
    void _clientId;
    result.push({ ...payload, id: item.id, parentId, order: index });
    result.push(...flattenTree(children, item.id));
  });
  return result;
}

function cloneTree(items: MenuDraftItem[]): MenuDraftItem[] { return items.map((item) => ({ ...item, children: cloneTree(item.children) })); }
function contains(item: MenuDraftItem, id: string): boolean { return item.id === id || item.children.some((child) => contains(child, id)); }

function removeFromTree(items: MenuDraftItem[], id: string): { items: MenuDraftItem[]; removed?: MenuDraftItem } {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) { const next = [...items]; const [removed] = next.splice(index, 1); return { items: next, removed }; }
  for (let index = 0; index < items.length; index += 1) {
    const result = removeFromTree(items[index]!.children, id);
    if (result.removed) { const next = [...items]; next[index] = { ...next[index]!, children: result.items }; return { items: next, removed: result.removed }; }
  }
  return { items };
}

function insertBefore(items: MenuDraftItem[], targetId: string, item: MenuDraftItem): { items: MenuDraftItem[]; inserted: boolean } {
  const index = items.findIndex((entry) => entry.id === targetId);
  if (index >= 0) { const next = [...items]; next.splice(index, 0, item); return { items: next, inserted: true }; }
  for (let index = 0; index < items.length; index += 1) {
    const result = insertBefore(items[index]!.children, targetId, item);
    if (result.inserted) { const next = [...items]; next[index] = { ...next[index]!, children: result.items }; return { items: next, inserted: true }; }
  }
  return { items, inserted: false };
}

function insertInside(items: MenuDraftItem[], targetId: string, item: MenuDraftItem): { items: MenuDraftItem[]; inserted: boolean } {
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index]!;
    if (current.id === targetId) { const next = [...items]; next[index] = { ...current, children: [...current.children, item] }; return { items: next, inserted: true }; }
    const result = insertInside(current.children, targetId, item);
    if (result.inserted) { const next = [...items]; next[index] = { ...current, children: result.items }; return { items: next, inserted: true }; }
  }
  return { items, inserted: false };
}

function updateTreeItem(items: MenuDraftItem[], id: string, patch: Partial<MenuDraftItem>): MenuDraftItem[] {
  return items.map((item) => item.id === id ? { ...item, ...patch } : { ...item, children: updateTreeItem(item.children, id, patch) });
}
function removeTreeItem(items: MenuDraftItem[], id: string): MenuDraftItem[] { return removeFromTree(items, id).items; }

function moveBeforeTree(items: MenuDraftItem[], id: string, targetId: string): MenuDraftItem[] {
  if (id === targetId || items.some((item) => item.id === id && contains(item, targetId))) return items;
  const removed = removeFromTree(items, id); if (!removed.removed) return items;
  const inserted = insertBefore(removed.items, targetId, removed.removed); return inserted.inserted ? inserted.items : items;
}
function moveInsideTree(items: MenuDraftItem[], id: string, targetId: string): MenuDraftItem[] {
  if (id === targetId || items.some((item) => item.id === id && contains(item, targetId))) return items;
  const removed = removeFromTree(items, id); if (!removed.removed) return items;
  const inserted = insertInside(removed.items, targetId, removed.removed); return inserted.inserted ? inserted.items : items;
}

interface ItemContext { siblings: MenuDraftItem[]; index: number; parent?: MenuDraftItem; }
function findContext(items: MenuDraftItem[], id: string, parent?: MenuDraftItem): ItemContext | null {
  const index = items.findIndex((item) => item.id === id); if (index >= 0) return { siblings: items, index, parent };
  for (const item of items) { const result = findContext(item.children, id, item); if (result) return result; }
  return null;
}
function shiftTreeItem(items: MenuDraftItem[], id: string, delta: -1 | 1): MenuDraftItem[] {
  const next = cloneTree(items); const context = findContext(next, id); if (!context) return items;
  const target = context.index + delta; if (target < 0 || target >= context.siblings.length) return items;
  [context.siblings[context.index], context.siblings[target]] = [context.siblings[target]!, context.siblings[context.index]!]; return next;
}
function indentTreeItem(items: MenuDraftItem[], id: string): MenuDraftItem[] {
  const next = cloneTree(items); const context = findContext(next, id); if (!context || context.index === 0) return items;
  return moveInsideTree(next, id, context.siblings[context.index - 1]!.id);
}
function outdentTreeItem(items: MenuDraftItem[], id: string): MenuDraftItem[] {
  const next = cloneTree(items); const context = findContext(next, id); if (!context?.parent) return items;
  return moveBeforeTree(next, id, context.parent.id);
}
function newItem(candidate: LinkCandidate): MenuDraftItem {
  const id = makeId('item');
  return { id, clientId: id, type: candidate.type, label: candidate.label, url: candidate.url, objectId: candidate.objectId, objectType: candidate.objectType, parentId: null, order: 0, target: '_self', children: [] };
}

function MenuTree(props: { items: MenuDraftItem[]; depth?: number; t: (key: string, params?: Record<string, string | number>) => string; onChange: (items: MenuDraftItem[]) => void }) {
  const [dragging, setDragging] = createSignal<string | null>(null);
  return <div class="wp-menu-tree" data-depth={props.depth ?? 0}><For each={props.items}>{(item) => <article class="wp-menu-item" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const source = dragging() ?? event.dataTransfer?.getData('text/plain'); if (source) props.onChange(moveBeforeTree(props.items, source, item.id)); setDragging(null); }}>
    <div class="wp-menu-item__header"><span class="wp-menu-drag" draggable="true" title={props.t('menus.editor.drag')} onDragStart={(event) => { setDragging(item.id); event.dataTransfer?.setData('text/plain', item.id); }} onDragEnd={() => setDragging(null)}>⠿⠿⠿</span><span class="wp-menu-item__label"><strong>{item.label || props.t('menus.editor.untitled')}</strong><small>{item.url || props.t('menus.editor.noUrl')}</small></span><div class="wp-menu-item__actions"><button type="button" class="btn btn-sm" title={props.t('menus.editor.up')} onClick={() => props.onChange(shiftTreeItem(props.items, item.id, -1))}>↑</button><button type="button" class="btn btn-sm" title={props.t('menus.editor.down')} onClick={() => props.onChange(shiftTreeItem(props.items, item.id, 1))}>↓</button><button type="button" class="btn btn-sm" title={props.t('menus.editor.indent')} onClick={() => props.onChange(indentTreeItem(props.items, item.id))}>→</button><button type="button" class="btn btn-sm" title={props.t('menus.editor.outdent')} onClick={() => props.onChange(outdentTreeItem(props.items, item.id))}>←</button></div></div>
    <details class="wp-menu-item__details"><summary>{props.t('menus.editor.itemSettings')}</summary><div class="wp-menu-item__fields"><label>{props.t('menus.editor.navigationLabel')}<input class="input" value={item.label} onInput={(event) => props.onChange(updateTreeItem(props.items, item.id, { label: event.currentTarget.value }))} /></label><label>{props.t('menus.editor.url')}<input class="input" value={item.url ?? ''} onInput={(event) => props.onChange(updateTreeItem(props.items, item.id, { url: event.currentTarget.value }))} /></label><label>{props.t('menus.editor.titleAttribute')}<input class="input" value={item.attrTitle ?? ''} onInput={(event) => props.onChange(updateTreeItem(props.items, item.id, { attrTitle: event.currentTarget.value }))} /></label><label>{props.t('menus.editor.cssClasses')}<input class="input" value={item.cssClasses ?? ''} onInput={(event) => props.onChange(updateTreeItem(props.items, item.id, { cssClasses: event.currentTarget.value }))} /></label><label>{props.t('menus.editor.target')}<select class="input" value={item.target ?? '_self'} onChange={(event) => props.onChange(updateTreeItem(props.items, item.id, { target: event.currentTarget.value as '_self' | '_blank' }))}><option value="_self">{props.t('menus.editor.sameWindow')}</option><option value="_blank">{props.t('menus.editor.newWindow')}</option></select></label><label>{props.t('menus.editor.xfn')}<input class="input" value={item.xfn ?? ''} onInput={(event) => props.onChange(updateTreeItem(props.items, item.id, { xfn: event.currentTarget.value }))} /></label><label class="wp-menu-item__wide">{props.t('menus.editor.description')}<textarea class="input" rows={2} value={item.description ?? ''} onInput={(event) => props.onChange(updateTreeItem(props.items, item.id, { description: event.currentTarget.value }))} /></label><button type="button" class="btn btn-danger btn-sm" onClick={() => props.onChange(removeTreeItem(props.items, item.id))}>{props.t('menus.editor.remove')}</button></div></details>
    <Show when={item.children.length > 0}><MenuTree items={item.children} depth={(props.depth ?? 0) + 1} t={props.t} onChange={(children) => props.onChange(updateTreeItem(props.items, item.id, { children }))} /></Show>
  </article>}</For><Show when={props.items.length === 0}><div class="wp-menu-empty-level">{props.t('menus.editor.emptyLevel')}</div></Show></div>;
}

function LinkBox(props: { title: string; description?: string; children: JSX.Element; open?: boolean }) {
  return <details class="wp-menu-box" open={props.open}><summary>{props.title}</summary><div class="wp-menu-box__body"><Show when={props.description}><p class="muted">{props.description}</p></Show>{props.children}</div></details>;
}

export function MenuManager() {
  const { t } = useTranslation();
  const [menus, setMenus] = createSignal<Menu[]>([]); const [editing, setEditing] = createSignal<MenuForm | null>(null);
  const [pages, setPages] = createSignal<Content[]>([]); const [posts, setPosts] = createSignal<Content[]>([]); const [customContent, setCustomContent] = createSignal<Record<string, Content[]>>({}); const [contentTypes, setContentTypes] = createSignal<ContentType[]>([]); const [taxonomies, setTaxonomies] = createSignal<Taxonomy[]>([]); const [terms, setTerms] = createSignal<Record<string, TaxonomyTerm[]>>({});
  const [pageSearch, setPageSearch] = createSignal(''); const [postSearch, setPostSearch] = createSignal(''); const [selectedLinks, setSelectedLinks] = createSignal<string[]>([]); const [customUrl, setCustomUrl] = createSignal(''); const [customLabel, setCustomLabel] = createSignal('');
  const [loading, setLoading] = createSignal(true); const [saving, setSaving] = createSignal(false); const [error, setError] = createSignal(''); const [notice, setNotice] = createSignal('');

  const load = async (): Promise<void> => {
    setLoading(true); setError('');
    try {
      const [hookMenus, pageResult, postResult, types, taxonomyList] = await Promise.all([apiClient.getMenus(), apiClient.getContent({ type: 'page', status: 'PUBLISHED', limit: 100 }), apiClient.getContent({ type: 'post', status: 'PUBLISHED', limit: 100 }), apiClient.getContentTypes(), apiClient.getTaxonomies()]);
      setMenus(hookMenus); setPages(pageResult.data); setPosts(postResult.data); setContentTypes(types); setTaxonomies(taxonomyList);
      const customEntries = await Promise.all(types.filter((type) => type.slug !== 'page' && type.slug !== 'post' && !type.singleton).map(async (type) => [type.slug, (await apiClient.getContent({ type: type.slug, status: 'PUBLISHED', limit: 100 })).data] as const));
      setCustomContent(Object.fromEntries(customEntries));
      const termEntries = await Promise.all(taxonomyList.map(async (taxonomy) => [taxonomy.slug, await apiClient.getTaxonomyTerms(taxonomy.slug)] as const)); setTerms(Object.fromEntries(termEntries));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setLoading(false); }
  };
  onMount(load);
  const start = (menu?: Menu): void => { setEditing({ id: menu?.id, name: menu?.name ?? '', slug: menu?.slug ?? '', items: toTree(menu?.items), settings: { ...(menu?.settings ?? {}) } }); setSelectedLinks([]); setError(''); setNotice(''); };
  const update = (patch: Partial<MenuForm>): void => { const current = editing(); if (current) setEditing({ ...current, ...patch }); };
  const addOne = (candidate: LinkCandidate): void => { const current = editing(); if (current) update({ items: [...current.items, newItem(candidate)] }); };
  const addCandidates = (candidates: LinkCandidate[]): void => { const chosen = new Set(selectedLinks()); const current = editing(); if (!current) return; update({ items: [...current.items, ...candidates.filter((candidate) => chosen.has(candidate.id)).map(newItem)] }); setSelectedLinks([]); };
  const customLink = (): void => { if (!customUrl().trim() || !customLabel().trim()) return; addOne({ id: makeId('custom'), type: 'custom', label: customLabel().trim(), url: customUrl().trim() }); setCustomUrl(''); setCustomLabel(''); };
  const save = async (event: Event): Promise<void> => { event.preventDefault(); const current = editing(); if (!current) return; if (!current.name.trim()) { setError(t('menus.nameRequired')); return; } setSaving(true); setError(''); try { const payload = { name: current.name.trim(), slug: current.slug.trim() || slugify(current.name), items: flattenTree(current.items), settings: current.settings }; if (current.id) await apiClient.updateMenu(current.id, payload); else await apiClient.createMenu(payload); setEditing(null); setNotice(t('menus.saved')); await load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setSaving(false); } };
  const remove = async (menu: Menu): Promise<void> => { if (!menu.id || !confirm(t('menus.confirmDelete', { name: menu.name }))) return; try { await apiClient.deleteMenu(menu.id); setNotice(t('menus.deleted')); await load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } };
  const filteredPages = createMemo(() => pages().filter((page) => !pageSearch() || `${page.title} ${page.slug}`.toLowerCase().includes(pageSearch().toLowerCase())));
  const filteredPosts = createMemo(() => posts().filter((post) => !postSearch() || `${post.title} ${post.slug}`.toLowerCase().includes(postSearch().toLowerCase())));
  const pageCandidate = (page: Content): LinkCandidate => ({ id: `page:${page.id}`, type: 'page', label: page.title, url: `/${page.slug}`, objectId: page.id, objectType: 'page' });
  const postCandidate = (post: Content): LinkCandidate => ({ id: `post:${post.id}`, type: 'post', label: post.title, url: `/post/${post.slug}`, objectId: post.id, objectType: 'post' });
  const customCandidate = (content: Content): LinkCandidate => ({ id: `content:${content.type}:${content.id}`, type: 'content', label: content.title, url: `/${content.type}/${content.slug}`, objectId: content.id, objectType: content.type });

  return <div class="menus-manager wp-menus-manager"><Show when={error()}><div class="notice notice--error">{error()}</div></Show><Show when={notice()}><div class="notice">{notice()}</div></Show><Show when={!loading()} fallback={<div class="skeleton">{t('common.loading')}</div>}>
    <Show when={editing()} fallback={<><div class="manager-toolbar"><p class="muted">{t('menus.hint')}</p><button class="btn btn-primary" type="button" onClick={() => start()}>+ {t('menus.new')}</button></div><section class="card"><Show when={menus().length > 0} fallback={<p class="muted empty-state">{t('menus.empty')}</p>}><table class="table"><thead><tr><th>{t('menus.name')}</th><th>{t('menus.slug')}</th><th>{t('menus.items')}</th><th /></tr></thead><tbody><For each={menus()}>{(menu) => <tr><td><strong>{menu.name}</strong></td><td><code>{menu.slug}</code></td><td>{menu.items?.length ?? 0}</td><td class="menu-actions"><button class="btn btn-secondary btn-sm" type="button" onClick={() => start(menu)}>{t('common.edit')}</button>{' '}<button class="btn btn-danger btn-sm" type="button" onClick={() => void remove(menu)}>{t('common.delete')}</button></td></tr>}</For></tbody></table></Show></section></>}>
      {(current) => <form class="wp-menu-editor" onSubmit={save}><div class="wp-menu-editor__top"><div><button type="button" class="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>← {t('menus.back')}</button><span class="wp-eyebrow">{t('menus.editor.eyebrow')}</span><h3>{current().id ? t('menus.edit') : t('menus.create')}</h3></div><div class="form-actions"><button class="btn btn-secondary" type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button><button class="btn btn-primary" type="submit" disabled={saving()}>{saving() ? t('common.loading') : t('common.save')}</button></div></div><div class="wp-menu-editor__identity card"><label>{t('menus.name')}<input class="input" required value={current().name} onInput={(event) => update({ name: event.currentTarget.value })} /></label><label>{t('menus.slug')}<input class="input" value={current().slug} placeholder={slugify(current().name)} onInput={(event) => update({ slug: event.currentTarget.value })} /></label></div><div class="wp-menu-editor__columns"><aside class="wp-menu-sources"><h4>{t('menus.editor.addItems')}</h4><LinkBox title={t('menus.sources.pages')} open><input class="input" placeholder={t('menus.editor.search')} value={pageSearch()} onInput={(event) => setPageSearch(event.currentTarget.value)} /><div class="wp-source-list"><For each={filteredPages()}>{(page) => <label class="wp-source-row"><input type="checkbox" checked={selectedLinks().includes(`page:${page.id}`)} onChange={(event) => setSelectedLinks(event.currentTarget.checked ? [...selectedLinks(), `page:${page.id}`] : selectedLinks().filter((id) => id !== `page:${page.id}`))} /><span>{page.title}<small>/{page.slug}</small></span></label>}</For></div><button type="button" class="btn btn-secondary btn-sm" onClick={() => addCandidates(filteredPages().map(pageCandidate))}>{t('menus.editor.addSelected')}</button></LinkBox><LinkBox title={t('menus.sources.posts')}><input class="input" placeholder={t('menus.editor.search')} value={postSearch()} onInput={(event) => setPostSearch(event.currentTarget.value)} /><div class="wp-source-list"><For each={filteredPosts()}>{(post) => <label class="wp-source-row"><input type="checkbox" checked={selectedLinks().includes(`post:${post.id}`)} onChange={(event) => setSelectedLinks(event.currentTarget.checked ? [...selectedLinks(), `post:${post.id}`] : selectedLinks().filter((id) => id !== `post:${post.id}`))} /><span>{post.title}<small>/post/{post.slug}</small></span></label>}</For></div><button type="button" class="btn btn-secondary btn-sm" onClick={() => addCandidates(filteredPosts().map(postCandidate))}>{t('menus.editor.addSelected')}</button></LinkBox><LinkBox title={t('menus.sources.contentTypes')}><For each={contentTypes().filter((type) => type.slug !== 'page' && type.slug !== 'post' && !type.singleton)}>{(type) => <div class="wp-taxonomy-source"><strong>{type.pluralLabel}</strong><For each={customContent()[type.slug] ?? []}>{(content) => <button type="button" class="wp-source-link" onClick={() => addOne(customCandidate(content))}>{content.title}<small>/{type.slug}/{content.slug}</small></button>}</For></div>}</For></LinkBox><LinkBox title={t('menus.sources.custom')} description={t('menus.sources.customHint')}><label>{t('menus.editor.url')}<input class="input" value={customUrl()} placeholder="https://" onInput={(event) => setCustomUrl(event.currentTarget.value)} /></label><label>{t('menus.editor.navigationLabel')}<input class="input" value={customLabel()} onInput={(event) => setCustomLabel(event.currentTarget.value)} /></label><button type="button" class="btn btn-secondary btn-sm" onClick={customLink}>{t('menus.editor.addToMenu')}</button></LinkBox><LinkBox title={t('menus.sources.home')}><button type="button" class="btn btn-secondary btn-sm" onClick={() => addOne({ id: 'home', type: 'home', label: t('menus.sources.home'), url: '/' })}>{t('menus.editor.addToMenu')}</button></LinkBox><LinkBox title={t('menus.sources.archives')}><div class="wp-source-list"><For each={contentTypes().filter((type) => type.hasArchive)}>{(type) => <button type="button" class="wp-source-link" onClick={() => addOne({ id: `archive:${type.slug}`, type: 'archive', label: type.pluralLabel, url: `/${type.slug}`, objectType: type.slug })}>{type.pluralLabel}<small>/{type.slug}</small></button>}</For></div></LinkBox><LinkBox title={t('menus.sources.taxonomies')}><For each={taxonomies()}>{(taxonomy) => <div class="wp-taxonomy-source"><strong>{taxonomy.name}</strong><For each={terms()[taxonomy.slug] ?? []}>{(term) => <button type="button" class="wp-source-link" onClick={() => addOne({ id: `term:${taxonomy.slug}:${term.slug}`, type: 'taxonomy', label: term.name, url: `/${taxonomy.slug}/${term.slug}`, objectId: term.id, objectType: taxonomy.slug })}>{term.name}<small>/{taxonomy.slug}/{term.slug}</small></button>}</For></div>}</For></LinkBox></aside><main class="wp-menu-structure"><div class="wp-structure-heading"><div><h4>{t('menus.editor.structure')}</h4><p class="muted">{t('menus.editor.structureHint')}</p></div><span class="badge">{current().items.length} {t('menus.items')}</span></div><Show when={current().items.length > 0} fallback={<div class="wp-menu-empty card">{t('menus.editor.empty')}</div>}><MenuTree items={current().items} t={t} onChange={(items) => update({ items })} /></Show><section class="card wp-menu-settings"><h4>{t('menus.editor.settings')}</h4><label class="checkbox-label"><input type="checkbox" checked={current().settings.autoAddNewPages === true} onChange={(event) => update({ settings: { ...current().settings, autoAddNewPages: event.currentTarget.checked } })} /> {t('menus.editor.autoAddPages')}</label><p class="muted">{t('menus.editor.autoAddPagesHint')}</p></section></main></div></form>}
    </Show>
  </Show><style>{`.wp-menu-editor__top,.wp-structure-heading,.wp-menu-editor__identity,.wp-menu-item__header,.wp-menu-item__actions,.form-actions{display:flex;align-items:center;gap:.7rem}.wp-menu-editor__top,.wp-structure-heading{justify-content:space-between}.wp-menu-editor__top{margin-bottom:1rem}.wp-menu-editor__top h3{margin:.25rem 0 0}.wp-eyebrow{display:block;margin-top:.7rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--color-muted)}.wp-menu-editor__identity{margin-bottom:1rem;align-items:end}.wp-menu-editor__identity label{display:grid;gap:.35rem;flex:1}.wp-menu-editor__columns{display:grid;grid-template-columns:330px minmax(0,1fr);gap:1.2rem;align-items:start}.wp-menu-sources,.wp-menu-structure{min-width:0}.wp-menu-sources>h4,.wp-structure-heading h4{margin:0}.wp-menu-box{background:var(--color-surface,#fff);border:1px solid var(--color-border,#ddd);margin-bottom:.7rem}.wp-menu-box summary{cursor:pointer;padding:.8rem;font-weight:600}.wp-menu-box__body{padding:0 .8rem .8rem;display:grid;gap:.6rem}.wp-menu-box__body p{margin:0}.wp-source-list{display:grid;gap:.35rem;max-height:220px;overflow:auto;border:1px solid var(--color-border,#ddd);padding:.45rem}.wp-source-row{display:flex!important;align-items:start;gap:.45rem!important;padding:.3rem}.wp-source-row span,.wp-source-link{display:grid;gap:.12rem;text-align:left}.wp-source-row small,.wp-source-link small,.wp-menu-item__label small{color:var(--color-muted);font-size:.75rem}.wp-source-link{border:0;background:none;color:inherit;padding:.35rem;width:100%;cursor:pointer}.wp-source-link:hover{background:var(--color-surface-muted,#f5f5f5)}.wp-taxonomy-source{display:grid;gap:.2rem;border-top:1px solid var(--color-border,#ddd);padding-top:.5rem}.wp-taxonomy-source:first-child{border-top:0;padding-top:0}.wp-menu-structure{background:var(--color-surface-muted,#f7f7f7);padding:1rem}.wp-menu-structure .wp-structure-heading{margin-bottom:1rem}.wp-menu-tree{display:grid;gap:.55rem}.wp-menu-tree[data-depth="1"]{margin:.55rem 0 0 2rem}.wp-menu-item{background:var(--color-surface,#fff);border:1px solid var(--color-border,#dcdcde);box-shadow:0 1px 1px rgba(0,0,0,.04)}.wp-menu-item__header{padding:.55rem .7rem}.wp-menu-drag{cursor:grab;letter-spacing:-.2rem;width:1.4rem;color:var(--color-muted);user-select:none}.wp-menu-item__label{display:grid;gap:.15rem;flex:1;min-width:0}.wp-menu-item__label small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wp-menu-item__actions{margin-left:auto}.wp-menu-item__details{border-top:1px solid var(--color-border,#ddd)}.wp-menu-item__details summary{padding:.5rem .7rem;cursor:pointer;color:var(--color-muted);font-size:.85rem}.wp-menu-item__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem;padding:.7rem;border-top:1px solid var(--color-border,#ddd)}.wp-menu-item__fields label{display:grid;gap:.3rem}.wp-menu-item__wide{grid-column:1/-1}.wp-menu-empty,.wp-menu-empty-level{text-align:center;padding:2rem;color:var(--color-muted)}.wp-menu-empty-level{border:1px dashed var(--color-border,#ccc);padding:1rem}.wp-menu-settings{margin-top:1rem}.wp-menu-settings h4{margin-top:0}.wp-menu-settings p{margin-bottom:0}.wp-menus-manager .menu-actions{white-space:nowrap;text-align:right}@media(max-width:850px){.wp-menu-editor__columns{grid-template-columns:1fr}.wp-menu-sources{order:2}.wp-menu-structure{order:1}.wp-menu-editor__identity,.wp-menu-editor__top{align-items:stretch;display:grid}.wp-menu-item__fields{grid-template-columns:1fr}.wp-menu-item__wide{grid-column:auto}}`}</style></div>;
}
