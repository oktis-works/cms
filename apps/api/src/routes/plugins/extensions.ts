// @oktis-works/api - Admin UI extension state (FEAT-098 / DECI-027)
//
// `GET /plugins/extensions` merges two sources into a single AdminExtensionsState:
//   1. `manifest.admin` — static declarations persisted in plugins.manifest;
//   2. `api.admin.*`   — runtime registrations from the plugin bootstrap
//      (platform + tenant scopes).
//
// Namespacing: ids/slugs/componentIds get the plugin prefix (`plugin/`,
// `plugin:`) when the author does not provide one — two plugins never collide
// in a slot. Manifest validation (plugin-runtime/manifest.ts) requires
// capability on menus; the same rules are re-applied defensively here (the
// endpoint must never break on malformed rows coming from the database).

import type { AdminExtensionsState, PluginManifestAdmin } from '@oktis-works/types'

/** Statuses where the plugin actually runs (bootstrap enabledStatuses). */
export function isPluginActive(status: string | undefined | null): boolean {
  return status === 'ACTIVATED' || status === 'RUNNING'
}

export function emptyAdminExtensionsState(): AdminExtensionsState {
  return {
    menuPages: [],
    submenuPages: [],
    dashboardWidgets: [],
    metaBoxes: [],
    notices: [],
    columns: {},
    columnRenderers: {},
    actionLinks: [],
    editors: [],
  }
}

/** `plugin:Component` or full paths (`@/...`, `.../x.tsx`) stay untouched. */
function componentIdFor(slug: string, componentId: string): string {
  if (componentId.startsWith('@')) return componentId
  if (componentId.includes(':')) return componentId
  if (componentId.startsWith(`${slug}/`)) return `${slug}:${componentId.slice(slug.length + 1)}`
  return `${slug}:${componentId}`
}

function idFor(slug: string, id: string): string {
  return id.includes(':') ? id : `${slug}:${id}`
}

function menuSlugFor(slug: string, value: string): string {
  return value.startsWith(`${slug}/`) ? value : `${slug}/${value}`
}

/**
 * Converts the manifest `admin` block (flat columns/notices/editors form)
 * into the endpoint state format. Namespacing/dedupe happen in the merge.
 */
export function manifestAdminAsState(decl: PluginManifestAdmin): AdminExtensionsState {
  const state = emptyAdminExtensionsState()

  state.menuPages = (decl.menuPages ?? []).filter(
    (page) => typeof page?.slug === 'string' && typeof page?.label === 'string' && typeof page?.capability === 'string' && page.capability.length > 0
  )
  state.submenuPages = (decl.submenuPages ?? []).filter(
    (page) =>
      typeof page?.slug === 'string' &&
      typeof page?.label === 'string' &&
      typeof page?.parentSlug === 'string' &&
      typeof page?.capability === 'string' &&
      page.capability.length > 0
  )
  state.dashboardWidgets = (decl.dashboardWidgets ?? [])
    .filter((widget) => typeof widget?.id === 'string' && typeof widget?.title === 'string' && typeof widget?.componentId === 'string')
    .map((widget) => ({ ...widget, render: 'component' as const }))
  state.metaBoxes = (decl.metaBoxes ?? [])
    .filter(
      (box) =>
        typeof box?.id === 'string' &&
        typeof box?.title === 'string' &&
        typeof box?.componentId === 'string' &&
        Array.isArray(box.screens) &&
        box.screens.length > 0
    )
    .map((box) => ({
      ...box,
      context: box.context ?? ('normal' as const),
      priority: box.priority ?? ('default' as const),
    }))
  state.notices = (decl.notices ?? [])
    .filter((notice) => typeof notice?.message === 'string')
    .map((notice, index) => ({
      level: notice.level ?? ('info' as const),
      message: notice.message,
      dismissible: notice.dismissible,
      id: notice.id ?? `m${index}`,
    }))
  state.editors = (decl.editors ?? []).filter(
    (editor) =>
      typeof editor?.id === 'string' &&
      typeof editor?.componentId === 'string' &&
      Array.isArray(editor.screens) &&
      editor.screens.length > 0 &&
      (editor.mode === 'replace-body' || editor.mode === 'below')
  )

  for (const column of decl.columns ?? []) {
    if (typeof column?.contentType !== 'string' || typeof column?.key !== 'string' || typeof column?.label !== 'string') continue
    const list = state.columns[column.contentType] ?? []
    if (!list.some((existing) => existing.key === column.key)) {
      list.push({ key: column.key, label: column.label, position: column.position })
      state.columns[column.contentType] = list
    }
  }
  for (const renderer of decl.columnRenderers ?? []) {
    if (typeof renderer?.contentType !== 'string' || typeof renderer?.key !== 'string' || typeof renderer?.componentId !== 'string') continue
    state.columnRenderers[renderer.contentType] = {
      ...(state.columnRenderers[renderer.contentType] ?? {}),
      [renderer.key]: renderer.componentId,
    }
  }
  state.actionLinks = (decl.actionLinks ?? []).filter(
    (link) => typeof link?.label === 'string' && typeof link?.url === 'string'
  )

  return state
}

/**
 * Merges ONE plugin's state (normalized manifest or runtime) into the
 * aggregated state, applying namespacing and dedupe by id/slug/key.
 */
export function mergePluginAdminState(target: AdminExtensionsState, source: AdminExtensionsState, pluginName: string): void {
  const slug = pluginName

  for (const page of source.menuPages) {
    if (!page?.capability) continue
    const prefixed = menuSlugFor(slug, page.slug)
    if (!target.menuPages.some((existing) => existing.slug === prefixed)) {
      target.menuPages.push({ ...page, slug: prefixed, componentId: page.componentId ? componentIdFor(slug, page.componentId) : undefined })
    }
  }
  for (const page of source.submenuPages) {
    if (!page?.capability) continue
    const parentSlug = menuSlugFor(slug, page.parentSlug)
    const prefixed = menuSlugFor(slug, page.slug)
    if (!target.submenuPages.some((existing) => existing.slug === prefixed)) {
      target.submenuPages.push({ ...page, parentSlug, slug: prefixed, componentId: page.componentId ? componentIdFor(slug, page.componentId) : undefined })
    }
  }
  for (const widget of source.dashboardWidgets) {
    if (!widget?.id || !widget?.title || !widget?.componentId) continue
    const id = idFor(slug, widget.id)
    if (target.dashboardWidgets.some((existing) => existing.id === id)) continue
    target.dashboardWidgets.push({
      ...widget,
      id,
      render: 'component',
      componentId: componentIdFor(slug, widget.componentId),
    })
  }
  for (const box of source.metaBoxes) {
    if (!box?.id || !box?.title || !box?.componentId || !Array.isArray(box.screens) || box.screens.length === 0) continue
    const id = idFor(slug, box.id)
    if (target.metaBoxes.some((existing) => existing.id === id)) continue
    target.metaBoxes.push({
      ...box,
      id,
      context: box.context ?? 'normal',
      priority: box.priority ?? 'default',
      componentId: componentIdFor(slug, box.componentId),
    })
  }
  for (const notice of source.notices) {
    if (!notice?.message || !notice?.id) continue
    const id = idFor(slug, notice.id)
    if (target.notices.some((existing) => existing.id === id)) continue
    target.notices.push({ ...notice, id })
  }
  for (const editor of source.editors ?? []) {
    if (!editor?.id || !editor?.componentId || !Array.isArray(editor.screens) || editor.screens.length === 0) continue
    if (editor.mode !== 'replace-body' && editor.mode !== 'below') continue
    const id = idFor(slug, editor.id)
    if (target.editors.some((existing) => existing.id === id)) continue
    target.editors.push({ ...editor, id, componentId: componentIdFor(slug, editor.componentId) })
  }
  for (const [contentType, columns] of Object.entries(source.columns ?? {})) {
    const list = target.columns[contentType] ?? []
    for (const column of columns) {
      if (!column?.key || !column?.label) continue
      if (!list.some((existing) => existing.key === column.key)) list.push(column)
    }
    target.columns[contentType] = list
  }
  for (const [contentType, renderers] of Object.entries(source.columnRenderers ?? {})) {
    const merged = { ...(target.columnRenderers[contentType] ?? {}) }
    for (const [key, componentId] of Object.entries(renderers)) {
      if (!componentId) continue
      merged[key] = componentIdFor(slug, componentId)
    }
    target.columnRenderers[contentType] = merged
  }
  for (const link of source.actionLinks ?? []) {
    if (!link?.label || !link?.url) continue
    if (!target.actionLinks.some((existing) => existing.url === link.url && existing.label === link.label)) {
      target.actionLinks.push(link)
    }
  }
}
