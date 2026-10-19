// @oktis-works/api - Estado declarativo dos slots de admin (FEAT-098 / DECI-027)
//
// `GET /plugins/extensions` mescla duas fontes em um único AdminExtensionsState:
//   1. `manifest.admin` — declarado no manifesto e persistido em plugins.manifest;
//   2. `api.admin.*`   — registrado em runtime pelo bootstrap (escopo platform + tenant).
//
// Namespacing: ids/slugs/componentIds ganham o prefixo do plugin (`plugin/`,
// `plugin:`) quando o autor não trouxer — dois plugins nunca colidem num slot.
// A validação do manifesto (plugin-runtime/manifest.ts) exige capability nos
// menus; aqui reaplicamos as regras defensivamente (o endpoint nunca quebra
// por entrada malformada vinda do banco).

import type { AdminExtensionsState, PluginManifestAdmin } from '@oktis-works/types'

/** Statuses em que o plugin roda de verdade (enabledStatuses do bootstrap). */
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
  }
}

/** `plugin:Component` ou caminho completo (`@/...`, `.../x.tsx`) intactos. */
function componentIdFor(slug: string, componentId: string): string {
  if (componentId.startsWith('@') || componentId.includes('/')) return componentId
  return componentId.includes(':') ? componentId : `${slug}:${componentId}`
}

function idFor(slug: string, id: string): string {
  return id.includes(':') ? id : `${slug}:${id}`
}

function menuSlugFor(slug: string, value: string): string {
  return value.startsWith(`${slug}/`) ? value : `${slug}/${value}`
}

/**
 * Converte o bloco `admin` do manifesto (forma flat de columns/notices) no
 * formato de estado do endpoint. Namespacing/dedupe acontecem no merge.
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
 * Mescla o estado de UM plugin (manifesto normalizado ou runtime) no estado
 * agregado, aplicando namespacing e dedupe por id/slug/chave.
 */
export function mergePluginAdminState(target: AdminExtensionsState, source: AdminExtensionsState, pluginName: string): void {
  const slug = pluginName

  for (const page of source.menuPages) {
    if (!page?.capability) continue
    const prefixed = menuSlugFor(slug, page.slug)
    if (!target.menuPages.some((existing) => existing.slug === prefixed)) {
      target.menuPages.push({ ...page, slug: prefixed })
    }
  }
  for (const page of source.submenuPages) {
    if (!page?.capability) continue
    const parentSlug = menuSlugFor(slug, page.parentSlug)
    const prefixed = menuSlugFor(slug, page.slug)
    if (!target.submenuPages.some((existing) => existing.slug === prefixed)) {
      target.submenuPages.push({ ...page, parentSlug, slug: prefixed })
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
