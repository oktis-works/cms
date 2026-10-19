// @oktis-works/web - Database adapter for the unified Theme SDK data API
import { postTypeRegistry, } from '@oktis-works/core';
import { getConnection } from '@oktis-works/database';
function text(row, camel, snake = camel.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`)) {
    const value = row[camel] ?? row[snake];
    return value === null || value === undefined ? undefined : String(value);
}
function contentRow(row) {
    const body = (row['body'] ?? row['data'] ?? {});
    return {
        id: text(row, 'id'),
        type: text(row, 'type'),
        title: text(row, 'title') ?? '',
        slug: text(row, 'slug') ?? '',
        excerpt: text(row, 'excerpt'),
        status: text(row, 'status'),
        body,
        data: body,
        featuredImageId: text(row, 'featuredImageId'),
        seoTitle: text(row, 'seoTitle'),
        seoDescription: text(row, 'seoDescription'),
        metadata: row['metadata'] ?? undefined,
        layout: row['layout'] ?? undefined,
        createdAt: row['createdAt'] ?? row['created_at'],
        updatedAt: row['updatedAt'] ?? row['updated_at'],
        publishedAt: row['publishedAt'] ?? row['published_at'],
    };
}
function menuRow(menu) {
    if (!menu)
        return null;
    return {
        id: String(menu['id']),
        name: String(menu['name']),
        slug: String(menu['slug']),
        items: Array.isArray(menu['items']) ? menu['items'] : [],
        settings: menu['settings'],
    };
}
function contentTypeRow(type) {
    return {
        ...type,
        name: type.name,
        slug: type.slug,
        singularLabel: type.singularLabel,
        pluralLabel: type.pluralLabel,
        supports: type.supports,
        hasArchive: type.hasArchive,
        singleton: type.singleton,
        menuIcon: type.menuIcon,
    };
}
function taxonomyRow(row) {
    return {
        id: text(row, 'id'),
        name: text(row, 'name') ?? '',
        slug: text(row, 'slug') ?? '',
        hierarchical: Boolean(row['hierarchical']),
        attachTo: (row['attach_to'] ?? row['attachTo'] ?? []),
        labels: (row['labels'] ?? {}),
        meta: (row['meta'] ?? {}),
    };
}
const PUBLIC_SETTING_GROUPS = new Set(['general', 'public', 'theme']);
const SENSITIVE_SETTING_KEY = /(password|secret|token|authorization|cookie|api[_-]?key|credential|private[_-]?key|hash)/i;
function publicSetting(row) {
    return !SENSITIVE_SETTING_KEY.test(String(row['key'] ?? ''));
}
export function createDatabaseThemeDataProvider(sql = getConnection(), tenantId) {
    return {
        async getMenu(slugOrName) {
            const rows = await sql.unsafe(`SELECT * FROM menus
         WHERE tenant_id = $1 AND (slug = $2 OR name = $2)
         ORDER BY CASE WHEN slug = $2 THEN 0 ELSE 1 END
         LIMIT 1`, [tenantId, slugOrName]);
            return menuRow(rows[0] ?? null);
        },
        async getMenus() {
            const rows = await sql.unsafe('SELECT * FROM menus WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
            return rows
                .map(menuRow)
                .filter((menu) => Boolean(menu));
        },
        async getContent(query = {}) {
            const page = Math.max(1, Math.floor(query.page ?? 1));
            const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
            const offset = (page - 1) * limit;
            const params = [tenantId, 'PUBLISHED'];
            const where = ['tenant_id = $1', 'status = $2'];
            if (query.type) {
                where.push(`type = $${params.length + 1}`);
                params.push(query.type);
            }
            if (query.search) {
                where.push(`(title ILIKE $${params.length + 1} OR slug ILIKE $${params.length + 2})`);
                params.push(`%${query.search}%`, `%${query.search}%`);
            }
            const orderBy = new Set(['created_at', 'updated_at', 'published_at', 'title']).has(query.orderBy ?? '') ? query.orderBy : 'created_at';
            const order = query.order === 'asc' ? 'ASC' : 'DESC';
            const rows = await sql.unsafe(`SELECT * FROM content WHERE ${where.join(' AND ')} ORDER BY ${orderBy} ${order} NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
            const countRows = await sql.unsafe(`SELECT COUNT(*)::int AS total FROM content WHERE ${where.join(' AND ')}`, params);
            const total = Number(countRows[0]?.['total'] ?? 0);
            return { data: rows.map(contentRow), total, page, limit, pages: Math.ceil(total / limit) };
        },
        async getContentById(id) {
            const rows = await sql.unsafe("SELECT * FROM content WHERE id = $1 AND tenant_id = $2 AND status = 'PUBLISHED' LIMIT 1", [id, tenantId]);
            return rows[0] ? contentRow(rows[0]) : null;
        },
        async getContentBySlug(slug, type) {
            const params = [slug, tenantId];
            let where = "slug = $1 AND tenant_id = $2 AND status = 'PUBLISHED'";
            if (type) {
                params.push(type);
                where += ` AND type = $${params.length}`;
            }
            const rows = await sql.unsafe(`SELECT * FROM content WHERE ${where} LIMIT 1`, params);
            return rows[0] ? contentRow(rows[0]) : null;
        },
        async getContentType(slug) {
            const type = await postTypeRegistry.getBySlug(slug);
            return type && type.public !== false ? contentTypeRow(type) : null;
        },
        async getContentTypes() {
            return (await postTypeRegistry.list()).filter((type) => type.public !== false).map(contentTypeRow);
        },
        async getTaxonomy(slug) {
            const rows = await sql.unsafe('SELECT * FROM taxonomies WHERE slug = $1 AND (tenant_id = $2 OR tenant_id IS NULL) LIMIT 1', [slug, tenantId]);
            return rows[0] ? taxonomyRow(rows[0]) : null;
        },
        async getTaxonomies() {
            const rows = await sql.unsafe('SELECT * FROM taxonomies WHERE tenant_id = $1 OR tenant_id IS NULL ORDER BY name ASC', [tenantId]);
            return rows.map(taxonomyRow);
        },
        async getTaxonomyTerms(taxonomy) {
            const rows = await sql.unsafe(`SELECT t.* FROM taxonomy_terms t
         JOIN taxonomies tx ON tx.id = t.taxonomy_id
         WHERE tx.slug = $1
           AND (tx.tenant_id = $2 OR tx.tenant_id IS NULL)
           AND (t.tenant_id = $2 OR t.tenant_id IS NULL)
         ORDER BY t.name ASC`, [taxonomy, tenantId]);
            return rows;
        },
        async getSettings(group) {
            if (group && !PUBLIC_SETTING_GROUPS.has(group))
                return {};
            const params = [tenantId];
            const groupClause = group ? ` AND "group" = $${params.length + 1}` : ` AND "group" = ANY($${params.length + 1}::text[])`;
            params.push(group ?? [...PUBLIC_SETTING_GROUPS]);
            const rows = await sql.unsafe(`SELECT key, value, tenant_id FROM settings
         WHERE (tenant_id = $1 OR tenant_id IS NULL)${groupClause}
         ORDER BY tenant_id NULLS FIRST, key ASC`, params);
            return Object.fromEntries(rows
                .filter(publicSetting)
                .map((row) => [String(row['key']), row['value']]));
        },
    };
}
export async function loadThemeRenderData(provider) {
    const [menus, contentTypes, taxonomies, settings] = await Promise.all([
        provider.getMenus(),
        provider.getContentTypes(),
        provider.getTaxonomies(),
        provider.getSettings(),
    ]);
    const termEntries = await Promise.all(taxonomies.map(async (taxonomy) => [taxonomy.slug, await provider.getTaxonomyTerms(taxonomy.slug)]));
    const bySlug = Object.fromEntries(menus.map((menu) => [menu.slug, menu]));
    return {
        menus: { all: menus, bySlug, ...bySlug },
        contentTypes,
        taxonomies,
        terms: Object.fromEntries(termEntries),
        settings,
    };
}
//# sourceMappingURL=theme-data.js.map