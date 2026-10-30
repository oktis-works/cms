/**
 * Menus Mapper
 * Maps wp_posts (nav_menu_item) + nav_menu taxonomy → OkCMS menus
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
  WPPost,
} from '../types';

export interface MenusMapperDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void;
  tenantId: string;
}

interface WPMenuItemMeta {
  '_menu_item_type'?: string;
  '_menu_item_object_id'?: string;
  '_menu_item_object'?: string;
  '_menu_item_target'?: string;
  '_menu_item_classes'?: string;
  '_menu_item_xfn'?: string;
  '_menu_item_url'?: string;
  '_menu_item_orphaned'?: string;
}

interface OkCMSMenuItem {
  id: string;
  type: 'custom' | 'post_type' | 'taxonomy' | 'post_type_archive';
  title: string;
  url?: string;
  target?: string;
  classes?: string[];
  xfn?: string;
  objectId?: string; // OkCMS content/term UUID
  objectType?: string; // content type or['taxonomy'] slug
  parentId?: string;
  order: number;
  children?: OkCMSMenuItem[];
}

export class MenusMapper {
  private deps: MenusMapperDeps;

  constructor(deps: MenusMapperDeps) {
    this.deps = deps;
  }

  /**
   * Main entry point: migrate menus
   */
  async migrate(): Promise<void> {
    const phase: MigrationPhase = 'menus';
    this.deps.stats[phase] = { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 };
    const startTime = Date.now();

    try {
      // 1. Get nav menus (taxonomy terms with taxonomy='nav_menu')
      const navMenus = await this.getNavMenus();

      // 2. Get all nav menu items
      const menuItems = await this.deps.connector.getNavMenuItems();

      // 3. Get menu item meta
      const menuItemIds = menuItems.map(m => m.ID);
      const meta = await this.deps.connector.getNavMenuItemMeta(menuItemIds);
      const metaMap = new Map<number, WPMenuItemMeta>();
      for (const m of meta) {
        if (!metaMap.has(m.post_id)) metaMap.set(m.post_id, {});
        const existing = metaMap.get(m.post_id)!;
        const { safePhpUnserialize } = await import('../transformers/serialized-php');
        let value: unknown = m.meta_value;
        if (m.meta_key === '_menu_item_classes') {
          value = safePhpUnserialize(m.meta_value);
        }
        (existing as Record<string, unknown>)[m.meta_key] = value;
      }

      // 4. Build menu items by menu
      const itemsByMenu = new Map<number, WPPost[]>();
      for (const item of menuItems) {
        const menuId = item.post_parent; // Nav menu items have post_parent = menu term_id
        if (!itemsByMenu.has(menuId)) itemsByMenu.set(menuId, []);
        itemsByMenu.get(menuId)!.push(item);
      }

      // 5. Migrate each menu
      for (const menu of navMenus) {
        try {
          await this.migrateMenu(menu, itemsByMenu.get(menu.term.term_id) ?? [], metaMap);
        } catch (error) {
          this.deps.stats[phase].errors++;
          this.addError(phase, 'nav_menu', menu.term.term_id, 'migrate_menu', error instanceof Error ? error.message : 'Unknown error');
        }
      }

      this.deps.stats[phase].durationMs = Date.now() - startTime;
    } catch (error) {
      this.deps.stats[phase].errors++;
      this.addError(phase, 'menus', 0, 'migrate', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get nav menus from wp_terms + wp_term_taxonomy
   */
  private async getNavMenus(): Promise<Array<{ term: { term_id: number; name: string; slug: string }; taxonomy: { term_taxonomy_id: number } }>> {
    const { connector } = this.deps;

    const rows = await connector.query<{
      term_id: number;
      name: string;
      slug: string;
      term_taxonomy_id: number;
    }>(`
      SELECT t.term_id, t.name, t.slug, tt.term_taxonomy_id
      FROM ${connector.table('terms')} t
      JOIN ${connector.table('term_taxonomy')} tt ON t.term_id = tt.term_id
      WHERE tt.taxonomy = 'nav_menu'
      ORDER BY t.term_id
    `);

    return rows.map(r => ({
      term: { term_id: r.term_id, name: r.name, slug: r.slug },
      taxonomy: { term_taxonomy_id: r.term_taxonomy_id },
    }));
  }

  /**
   * Migrate a single menu
   */
  private async migrateMenu(
    menu: { term: { term_id: number; name: string; slug: string }; taxonomy: { term_taxonomy_id: number } },
    items: WPPost[],
    metaMap: Map<number, WPMenuItemMeta>
  ): Promise<void> {
    const { connector, idMaps, tenantId, stats } = this.deps;

    // Check if menu already exists
    const existing = await connector.queryOne<{ id: string }>(
      `SELECT id FROM menus WHERE tenant_id = ? AND slug = ?`,
      [tenantId, menu.term.slug]
    );

    // Build menu items tree (already converts to OkCMS format)
    const okcmsItems = this.buildMenuTree(items, metaMap).filter(Boolean) as OkCMSMenuItem[];

    const menuData = {
      items: okcmsItems,
      settings: {
        themeLocations: await this.getThemeLocations(menu.taxonomy.term_taxonomy_id),
      },
    };

    let menuId: string;

    if (existing) {
      menuId = existing.id;
      await connector.query(
        `UPDATE menus SET name = ?, items = ?, settings = ?, updated_at = NOW() WHERE id = ?`,
        [menu.term.name, JSON.stringify(menuData.items), JSON.stringify(menuData.settings), menuId]
      );
      stats['menus'].updated++;
    } else {
      menuId = crypto.randomUUID();
      await connector.query(
        `INSERT INTO menus (id, tenant_id, name, slug, items, settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [menuId, tenantId, menu.term.name, menu.term.slug, JSON.stringify(menuData.items), JSON.stringify(menuData.settings)]
      );
      stats['menus'].created++;
    }

    // Map WP nav_menu term_id -> OkCMS menu UUID
    idMaps.menu.set(menu.term.term_id, menuId);
  }

  /**
   * Build hierarchical menu tree from flat items
   */
  private buildMenuTree(items: WPPost[], metaMap: Map<number, WPMenuItemMeta>): OkCMSMenuItem[] {
    const itemMap = new Map<number, OkCMSMenuItem>();
    const roots: OkCMSMenuItem[] = [];

    // First pass: create all items
    for (const item of items) {
      const meta = metaMap.get(item.ID) ?? {};
      const menuItem = this.convertMenuItem({ post: item, meta });
      if (menuItem) {
        itemMap.set(item.ID, menuItem);
      }
    }

    // Second pass: build hierarchy
    for (const item of items) {
      const menuItem = itemMap.get(item.ID);
      if (!menuItem) continue;

      const parentId = item.post_parent;
      if (parentId > 0 && parentId !== item.ID) {
        const parent = itemMap.get(parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(menuItem);
        } else {
          // Parent not in this menu (orphaned), treat as root
          roots.push(menuItem);
        }
      } else {
        roots.push(menuItem);
      }
    }

    // Sort by menu_order
    const sortByOrder = (a: OkCMSMenuItem, b: OkCMSMenuItem) => a.order - b.order;
    roots.sort(sortByOrder);
    for (const root of roots) {
      if (root.children) root.children.sort(sortByOrder);
    }

    return roots;
  }

  /**
   * Convert WP menu item to OkCMS format
   */
  private convertMenuItem(item: { post: WPPost; meta: WPMenuItemMeta } | WPPost & { meta?: WPMenuItemMeta }): OkCMSMenuItem | null {
    const post = 'post' in item ? item.post : item;
    const meta = ('meta' in item ? item.meta : item.meta) ?? {};

    const type = (meta._menu_item_type as OkCMSMenuItem['type']) ?? 'custom';
    const objectId = meta._menu_item_object_id ? parseInt(meta._menu_item_object_id, 10) : null;
    const object = meta._menu_item_object ?? '';
    const url = meta._menu_item_url ?? '';
    const target = meta._menu_item_target ?? '';
    const classes = Array.isArray(meta._menu_item_classes) ? meta._menu_item_classes : [];
    const xfn = meta._menu_item_xfn ?? '';

    let resolvedObjectId: string | undefined;
    let resolvedObjectType: string | undefined;

    if (objectId && (type === 'post_type' || type === 'taxonomy')) {
      if (type === 'post_type') {
        resolvedObjectId = this.deps.idMaps.content.get(objectId);
        resolvedObjectType = object;
      } else if (type === 'taxonomy') {
        resolvedObjectId = this.deps.idMaps.term.get(objectId);
        resolvedObjectType = object;
      }
    }

    return {
      id: crypto.randomUUID(),
      type,
      title: post.post_title,
      url: type === 'custom' ? url : undefined,
      target: target || undefined,
      classes: classes.length > 0 ? classes : undefined,
      xfn: xfn || undefined,
      objectId: resolvedObjectId,
      objectType: resolvedObjectType,
      parentId: post.post_parent > 0 && post.post_parent !== post.ID
        ? this.deps.idMaps.menuItem.get(post.post_parent)
        : undefined,
      order: post.menu_order,
    };
  }

  /**
   * Get theme locations for a nav menu
   */
  private async getThemeLocations(menuTermTaxonomyId: number): Promise<Record<string, string>> {
    const { connector } = this.deps;

    // Theme locations are stored in wp_options as 'theme_mods_{theme_slug}' or 'nav_menu_locations'
    const locationsOption = await connector.queryOne<{ option_value: string }>(
      `SELECT option_value FROM ${connector.table('options')} WHERE option_name = 'nav_menu_locations'`
    );

    const locations: Record<string, string> = {};

    if (locationsOption && locationsOption.option_value) {
      try {
        const { safePhpUnserialize } = await import('../transformers/serialized-php');
        const locs = safePhpUnserialize(locationsOption.option_value);
        if (locs && typeof locs === 'object') {
          for (const [location, termId] of Object.entries(locs)) {
            if ((termId as number) === menuTermTaxonomyId) {
              locations[location] = String(termId);
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    return locations;
  }

  /**
   * Add error to collection
   */
  private addError(
    phase: MigrationPhase,
    wpTable: string,
    wpId: number | string,
    field: string,
    message: string
  ): void {
    this.deps.errors.push({
      phase,
      wpTable,
      wpId,
      field,
      message,
      severity: 'error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Factory function
 */
export async function migrateMenus(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  reportProgress: (phase: MigrationPhase, current: number, total: number) => void,
  tenantId: string
): Promise<void> {
  const mapper = new MenusMapper({ connector, config, idMaps, stats, errors, reportProgress, tenantId });
  await mapper.migrate();
}