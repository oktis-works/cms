// @oktis-works/database - Default data seeds (roles + settings)
//
// - As 5 roles do DEFAULT_POLICY do @oktis-works/auth precisam EXISTIR no
//   database: the JWT carries only the slugs (read from roles via tenant_users); without
//   the role row the user is born roleless → 403 on every protected route
//   (they could register and log in, but could do nothing).
// - Settings do grupo `general` para o admin ter o que editar (a tabela
//   nasce vazia).
//
// Idempotente: roda em QUALQUER banco (fresco ou existente) sem duplicar —
// roles via WHERE NOT EXISTS, settings via ON CONFLICT (UNIQUE(key,tenant)).

import { getConnection } from '../connection.js';
import { resolveTenantId } from './bootstrap.js';
import type postgres from 'postgres';

type Sql = postgres.Sql;

/** Canonical roles — MUST match the slugs of auth's DEFAULT_POLICY. */
export const DEFAULT_ROLES = [
  { name: 'Super Admin', slug: 'SUPER_ADMIN' },
  { name: 'Administrator', slug: 'TENANT_ADMIN' },
  { name: 'Editor', slug: 'EDITOR' },
  { name: 'Author', slug: 'AUTHOR' },
  { name: 'Reader', slug: 'VIEWER' },
] as const;

/** Initial settings of the `general` group (admin Settings → General form). */
export const DEFAULT_SETTINGS = [
  { key: 'siteTitle', value: 'My Site', type: 'string' },
  { key: 'siteDescription', value: 'A brand new site built with OkCMS', type: 'string' },
  { key: 'language', value: 'en', type: 'string' },
  { key: 'timezone', value: 'UTC', type: 'string' },
] as const;

/** Creates (if missing) the policy's global roles (tenant_id NULL). Returns the created count. */
export async function seedDefaultRoles(sql: Sql = getConnection()): Promise<number> {
  let inserted = 0;
  for (const role of DEFAULT_ROLES) {
    // Explicit cast: $2 appears in two contexts (insert value and
    // column comparison) — without it Postgres deduces different types
    // for the same parameter and fails with "inconsistent types deduced".
    const rows = await sql.unsafe(
      `INSERT INTO roles (name, slug, is_system, permissions)
       SELECT $1::varchar, $2::varchar, true, '[]'::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM roles WHERE slug = $2::varchar AND tenant_id IS NULL)
       RETURNING id`,
      [role.name, role.slug]
    );
    inserted += rows.length;
  }
  return inserted;
}

/** Creates (if missing) the initial settings in the given tenant. Returns the created count. */
export async function seedDefaultSettings(
  tenantId: string,
  sql: Sql = getConnection()
): Promise<number> {
  let inserted = 0;
  for (const s of DEFAULT_SETTINGS) {
    // RETURNING: sem ele o driver devolve [] mesmo com insert bem-sucedido
    // (it would count 0 in the log and break idempotency detection).
    const rows = await sql.unsafe(
      `INSERT INTO settings (tenant_id, key, value, "group", type)
       VALUES ($1, $2, to_jsonb($3::text), 'general', $4)
       ON CONFLICT (key, tenant_id) DO NOTHING
       RETURNING id`,
      [tenantId, s.key, s.value, s.type]
    );
    inserted += rows.length;
  }
  return inserted;
}

/**
 * Seed completo (roles + settings do tenant default). Idempotente — usar em
 * the CLI's `db:migrate`/`seed` and as a fallback on first-user registration.
 */
export async function seedCoreData(
  sql: Sql = getConnection()
): Promise<{ roles: number; settings: number }> {
  const roles = await seedDefaultRoles(sql);
  const tenantId = await resolveTenantId('default');
  const settings = await seedDefaultSettings(tenantId, sql);
  return { roles, settings };
}

/**
 * Seeds default field groups for Post and Page content types.
 * Idempotent — safe to run on any database (fresh or existing).
 * Creates: core-fields-post, core-fields-page with core fields (title, slug, content, etc.)
 */
export async function seedDefaultFieldGroups(
  sql: Sql = getConnection()
): Promise<{ fieldGroups: number; fieldDefinitions: number }> {
  const _tenantId = await resolveTenantId('default');
  let fieldGroupsCreated = 0;
  let fieldDefinitionsCreated = 0;

  // Create or get core-fields-post group
  const pgResult = await sql.unsafe(
    `INSERT INTO field_groups (tenant_id, title, key, location_rules, position, display_style, active, metadata)
     VALUES (NULL, 'Campos Padrão - Post', 'core-fields-post', '{"content_type": ["post"]}'::jsonb, 'normal', 'standard', true, '{}'::jsonb)
     ON CONFLICT (key) DO UPDATE SET
       title = EXCLUDED.title,
       location_rules = EXCLUDED.location_rules,
       active = EXCLUDED.active,
       updated_at = NOW()
     RETURNING id`
  );
  const pgGroupId = String(pgResult[0]?.['id']);
  if (pgResult.length > 0) fieldGroupsCreated++;

  // Create or get core-fields-page group
  const paResult = await sql.unsafe(
    `INSERT INTO field_groups (tenant_id, title, key, location_rules, position, display_style, active, metadata)
     VALUES (NULL, 'Campos Padrão - Page', 'core-fields-page', '{"content_type": ["page"]}'::jsonb, 'normal', 'standard', true, '{}'::jsonb)
     ON CONFLICT (key) DO UPDATE SET
       title = EXCLUDED.title,
       location_rules = EXCLUDED.location_rules,
       active = EXCLUDED.active,
       updated_at = NOW()
     RETURNING id`
  );
  const paGroupId = String(paResult[0]?.['id']);
  if (paResult.length > 0) fieldGroupsCreated++;

  // Core fields for Post
  const postCoreFields = [
    { type: 'text', name: 'title', key: 'title', label: 'Título', instructions: 'Título do post', required: true, config: '{}', sort_order: 1, is_locked: true, core_field_key: 'title' },
    { type: 'slug', name: 'slug', key: 'slug', label: 'Slug', instructions: 'URL amigável (único)', required: true, config: '{}', sort_order: 2, is_locked: true, core_field_key: 'slug' },
    { type: 'wysiwyg', name: 'content', key: 'content', label: 'Conteúdo', instructions: 'Corpo principal do post', required: true, config: '{}', sort_order: 3, is_locked: false, core_field_key: 'content' },
    { type: 'textarea', name: 'excerpt', key: 'excerpt', label: 'Resumo', instructions: 'Resumo curto para listagens', required: false, config: '{}', sort_order: 4, is_locked: false, core_field_key: 'excerpt' },
    { type: 'image', name: 'featured_image', key: 'featured_image', label: 'Imagem Destacada', instructions: 'Imagem principal do post', required: false, config: '{}', sort_order: 5, is_locked: false, core_field_key: 'featured_image' },
    { type: 'text', name: 'seo_title', key: 'seo_title', label: 'SEO Title', instructions: 'Título para SEO (meta title)', required: false, config: '{}', sort_order: 6, is_locked: false, core_field_key: 'seo_title' },
    { type: 'textarea', name: 'seo_description', key: 'seo_description', label: 'SEO Description', instructions: 'Descrição para SEO (meta description)', required: false, config: '{}', sort_order: 7, is_locked: false, core_field_key: 'seo_description' },
    { type: 'select', name: 'status', key: 'status', label: 'Status', instructions: 'Status de publicação', required: true, config: '{"options":[{"value":"DRAFT","label":"Rascunho"},{"value":"PUBLISHED","label":"Publicado"},{"value":"ARCHIVED","label":"Arquivado"},{"value":"TRASHED","label":"Lixeira"}]}', sort_order: 8, is_locked: false, core_field_key: 'status' },
    { type: 'user', name: 'author', key: 'author', label: 'Autor', instructions: 'Autor do post', required: true, config: '{}', sort_order: 9, is_locked: false, core_field_key: 'author' },
  ];

  // Core fields for Page
  const pageCoreFields = [
    { type: 'text', name: 'title', key: 'title', label: 'Título', instructions: 'Título da página', required: true, config: '{}', sort_order: 1, is_locked: true, core_field_key: 'title' },
    { type: 'slug', name: 'slug', key: 'slug', label: 'Slug', instructions: 'URL amigável (único)', required: true, config: '{}', sort_order: 2, is_locked: true, core_field_key: 'slug' },
    { type: 'wysiwyg', name: 'content', key: 'content', label: 'Conteúdo', instructions: 'Corpo principal da página', required: true, config: '{}', sort_order: 3, is_locked: false, core_field_key: 'content' },
    { type: 'textarea', name: 'excerpt', key: 'excerpt', label: 'Resumo', instructions: 'Resumo curto para listagens', required: false, config: '{}', sort_order: 4, is_locked: false, core_field_key: 'excerpt' },
    { type: 'image', name: 'featured_image', key: 'featured_image', label: 'Imagem Destacada', instructions: 'Imagem principal da página', required: false, config: '{}', sort_order: 5, is_locked: false, core_field_key: 'featured_image' },
    { type: 'text', name: 'seo_title', key: 'seo_title', label: 'SEO Title', instructions: 'Título para SEO (meta title)', required: false, config: '{}', sort_order: 6, is_locked: false, core_field_key: 'seo_title' },
    { type: 'textarea', name: 'seo_description', key: 'seo_description', label: 'SEO Description', instructions: 'Descrição para SEO (meta description)', required: false, config: '{}', sort_order: 7, is_locked: false, core_field_key: 'seo_description' },
    { type: 'select', name: 'status', key: 'status', label: 'Status', instructions: 'Status de publicação', required: true, config: '{"options":[{"value":"DRAFT","label":"Rascunho"},{"value":"PUBLISHED","label":"Publicado"},{"value":"ARCHIVED","label":"Arquivado"},{"value":"TRASHED","label":"Lixeira"}]}', sort_order: 8, is_locked: false, core_field_key: 'status' },
    { type: 'user', name: 'author', key: 'author', label: 'Autor', instructions: 'Autor da página', required: true, config: '{}', sort_order: 9, is_locked: false, core_field_key: 'author' },
  ];

  for (const field of postCoreFields) {
    const result = await sql.unsafe(
      `INSERT INTO field_definitions (group_id, parent_field_id, type, name, key, label, instructions, required, config, sort_order, is_core_field, is_locked, core_field_key)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, true, $10, $11)
       ON CONFLICT (key) DO NOTHING
       RETURNING id`,
      [pgGroupId, field.type, field.name, field.key, field.label, field.instructions, field.required, field.config, field.sort_order, field.is_locked, field.core_field_key]
    );
    fieldDefinitionsCreated += result.length;
  }

  for (const field of pageCoreFields) {
    const result = await sql.unsafe(
      `INSERT INTO field_definitions (group_id, parent_field_id, type, name, key, label, instructions, required, config, sort_order, is_core_field, is_locked, core_field_key)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, true, $10, $11)
       ON CONFLICT (key) DO NOTHING
       RETURNING id`,
      [paGroupId, field.type, field.name, field.key, field.label, field.instructions, field.required, field.config, field.sort_order, field.is_locked, field.core_field_key]
    );
    fieldDefinitionsCreated += result.length;
  }

  return { fieldGroups: fieldGroupsCreated, fieldDefinitions: fieldDefinitionsCreated };
}

/** Lorem ipsum curto para campos de texto. */
const LOREM_IPSUM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

/** Long lorem ipsum for post/page content. */
const LOREM_LONG = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
`;

/** Default editor body structure (blocks + rendered html). */
function makeBody(html: string, blocks: unknown[] = []): Record<string, unknown> {
  return {
    html,
    content: html, // Keep in sync so classic editor reads it back
    blocks: blocks.length > 0 ? blocks : [
      { type: 'paragraph', content: html.replace(/<[^>]*>/g, '').slice(0, 200) },
    ],
  };
}

/**
 * Demo content seed (pages, posts, menus, reading settings).
 * Idempotent: ON CONFLICT on content (tenant_id, type, slug), menus (tenant_id, slug),
 * and settings (key, tenant_id).
 */
export async function seedDemoContent(
  sql: Sql = getConnection()
): Promise<{ pages: number; posts: number; menus: number; readingSettings: number }> {
  const tenantId = await resolveTenantId('default');

  // Clear previous demo data to guarantee idempotency
  await sql.unsafe(`
    DELETE FROM settings WHERE tenant_id = $1 AND "group" = 'reading'
      AND key IN ('static_front_page', 'page_for_posts', 'timezone_string', 'gmt_offset')
  `, [tenantId]);
  // Cleanup covers the correct slugs AND the broken rows left by earlier
  // seeds that swapped name/slug on insert (slug='Main Menu'/'Footer',
  // name='header'/'footer').
  await sql.unsafe(`
    DELETE FROM menus WHERE tenant_id = $1 AND (
      slug IN ('header', 'footer', 'Main Menu', 'Footer')
      OR name IN ('header', 'footer')
    )
  `, [tenantId]);
  // Cleanup covers BOTH the current English slugs and the legacy Portuguese
  // ones (pre-i18n seeds), so re-seeding never leaves orphaned demo rows.
  await sql.unsafe(`
    DELETE FROM content WHERE tenant_id = $1 AND slug IN (
      'home', 'about', 'blog', 'first-post', 'getting-started',
      'sobre', 'primeiro-post', 'segundo-post'
    )
  `, [tenantId]);
  await sql.unsafe(`
    DELETE FROM tenant_users WHERE tenant_id = $1 AND user_id IN (
      SELECT id FROM users WHERE email = 'admin@local'
    )
  `, [tenantId]);
  await sql.unsafe(`
    DELETE FROM users WHERE email = 'admin@local'
  `);
  console.log('[seedDemoContent] tenantId:', tenantId);

  // Check if constraint exists
  const constraintCheck = await sql.unsafe(`
    SELECT conname FROM pg_constraint 
    WHERE conrelid = 'content'::regclass AND contype = 'u'
  `);
  console.log('[seedDemoContent] constraints on content:', constraintCheck);

  // Default author: first user of the tenant (creates one if none exists)
  const authorResult = await sql.unsafe(
    `SELECT id FROM users WHERE id IN (SELECT user_id FROM tenant_users WHERE tenant_id = $1) LIMIT 1`,
    [tenantId]
  );
  let authorId: string;
  if (authorResult.length === 0) {
    // Fallback: creates an admin user when none exists
    const newUser = await sql.unsafe(
      `INSERT INTO users (email, name, password_hash, status)
       VALUES ('admin@local', 'Administrator', '$2b$10$dummy', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    authorId = String(newUser[0]?.['id'] ?? '');
    await sql.unsafe(
      `INSERT INTO tenant_users (tenant_id, user_id, role_id)
       SELECT $1, $2, id FROM roles WHERE slug = 'TENANT_ADMIN' AND (tenant_id = $1 OR tenant_id IS NULL) LIMIT 1
       ON CONFLICT (tenant_id, user_id) DO NOTHING`,
      [tenantId, authorId]
    );
  } else {
    authorId = String(authorResult[0]?.['id'] ?? '');
  }

  const now = new Date();

  // ---- PAGES ----
  const pages = [
    {
      type: 'page',
      slug: 'home',
      title: 'Home',
      excerpt: 'Welcome to your brand new OkCMS site.',
      body: makeBody(`
        <section class="hero">
          <p class="hero__kicker">Welcome to OkCMS</p>
          <h1 class="hero__title">Your new site is ready</h1>
          <p class="hero__description">Start publishing in minutes — create pages, posts and menus from the admin dashboard, then make this page your own.</p>
          <div class="hero__actions">
            <a href="/blog" class="btn btn--primary">Go to the blog</a>
            <a href="#contact" class="btn btn--ghost">Get in touch</a>
          </div>
        </section>

        <section id="about" class="section about-preview">
          <div>
            <p class="section__kicker">About</p>
            <h2 class="section__title">About Us</h2>
            <p class="section__lead">${LOREM_IPSUM}</p>
            <a class="btn btn--outline" href="/about">Read more →</a>
          </div>
        </section>

        <section id="contact" class="section contact">
          <p class="section__kicker">Contact</p>
          <h2 class="section__title">Get in Touch</h2>
          <p class="section__lead">Questions, feedback or ideas? Send us an email at <a href="mailto:hello@example.com">hello@example.com</a> — we would love to hear from you.</p>
        </section>
      `, [
        { type: 'heading', level: 1, content: 'Your new site is ready' },
        { type: 'paragraph', content: 'Start publishing in minutes — create pages, posts and menus from the admin dashboard, then make this page your own.' },
        { type: 'heading', level: 2, content: 'About Us' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Get in Touch' },
        { type: 'paragraph', content: 'Questions, feedback or ideas? Send us an email at hello@example.com — we would love to hear from you.' },
      ]),
    },
    {
      type: 'page',
      slug: 'about',
      title: 'About Us',
      excerpt: 'Learn more about our story and mission.',
      body: makeBody(`
        <h2>Our Story</h2>
        <p>${LOREM_LONG}</p>
        <h2>Our Mission</h2>
        <p>${LOREM_IPSUM}</p>
        <h2>Our Team</h2>
        <p>${LOREM_IPSUM}</p>
      `, [
        { type: 'heading', level: 2, content: 'Our Story' },
        { type: 'paragraph', content: LOREM_LONG },
        { type: 'heading', level: 2, content: 'Our Mission' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Our Team' },
        { type: 'paragraph', content: LOREM_IPSUM },
      ]),
    },
    {
      type: 'page',
      slug: 'blog',
      title: 'Blog',
      excerpt: 'Articles, tutorials and release notes.',
      body: makeBody(`
        <p>Welcome to our blog. Here you will find articles, tutorials and news about OkCMS.</p>
        <p>The latest posts are listed below automatically.</p>
      `, [
        { type: 'paragraph', content: 'Welcome to our blog. Here you will find articles, tutorials and news about OkCMS.' },
        { type: 'paragraph', content: 'The latest posts are listed below automatically.' },
      ]),
    },
  ] as const;

  let pagesCreated = 0;
  const pageIds: Record<string, string> = {};

  for (const page of pages) {
    console.log('[seedDemoContent] Inserting page:', page.slug, 'tenantId:', tenantId, 'authorId:', authorId);
    let result;
    try {
      // Use CTE-based upsert to avoid constraint caching issues
      // `$5::jsonb` PARSES the serialized document into a jsonb object;
      // `to_jsonb($5::text)` would wrap it as a jsonb string (double-encoded).
      result = await sql.unsafe(
        `WITH upsert AS (
          UPDATE content
          SET title = $3,
              body = $5::jsonb,
              excerpt = $6,
              status = 'PUBLISHED',
              author_id = $7,
              published_at = $9,
              updated_at = $10
          WHERE tenant_id = $1 AND type = $2 AND slug = $4
          RETURNING id
        )
        INSERT INTO content (tenant_id, type, title, slug, body, excerpt, status, author_id, published_at, created_at, updated_at)
        SELECT $1, $2, $3, $4, $5::jsonb, $6, 'PUBLISHED', $7, $8, $9, $10
        WHERE NOT EXISTS (SELECT 1 FROM content WHERE tenant_id = $1 AND type = $2 AND slug = $4)
        RETURNING id`,
      [tenantId, page.type, page.title, page.slug, JSON.stringify(page.body), page.excerpt, authorId, now, now, now]
      );
    } catch (error) {
      console.error('[seedDemoContent] Error inserting page:', page.slug, error);
      throw error;
    }
    pagesCreated += result.length;
    pageIds[page.slug] = String(result[0]?.['id'] ?? '');
  }

  // ---- POSTS ----
  const posts = [
    {
      type: 'post',
      slug: 'first-post',
      title: 'My First Blog Post',
      excerpt: 'This is the first demo post of the blog.',
      body: makeBody(`
        <h1>My First Blog Post</h1>
        <p>${LOREM_IPSUM}</p>
        <h2>Introduction</h2>
        <p>${LOREM_LONG}</p>
        <h2>Main Content</h2>
        <p>${LOREM_IPSUM}</p>
        <h3>Example Subsection</h3>
        <p>${LOREM_IPSUM}</p>
        <h2>Wrapping Up</h2>
        <p>${LOREM_LONG}</p>
      `, [
        { type: 'heading', level: 1, content: 'My First Blog Post' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Introduction' },
        { type: 'paragraph', content: LOREM_LONG },
        { type: 'heading', level: 2, content: 'Main Content' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 3, content: 'Example Subsection' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Wrapping Up' },
        { type: 'paragraph', content: LOREM_LONG },
      ]),
    },
    {
      type: 'post',
      slug: 'getting-started',
      title: 'Getting Started with OkCMS',
      excerpt: 'Learn the first steps to build your site with OkCMS.',
      body: makeBody(`
        <h1>Getting Started with OkCMS</h1>
        <p>${LOREM_IPSUM}</p>
        <h2>Installation</h2>
        <p>${LOREM_LONG}</p>
        <h2>Initial Setup</h2>
        <p>${LOREM_IPSUM}</p>
        <h3>Themes</h3>
        <p>${LOREM_IPSUM}</p>
        <h3>Plugins</h3>
        <p>${LOREM_IPSUM}</p>
        <h2>Creating Content</h2>
        <p>${LOREM_LONG}</p>
        <h2>Deploy</h2>
        <p>${LOREM_IPSUM}</p>
      `, [
        { type: 'heading', level: 1, content: 'Getting Started with OkCMS' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Installation' },
        { type: 'paragraph', content: LOREM_LONG },
        { type: 'heading', level: 2, content: 'Initial Setup' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 3, content: 'Themes' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 3, content: 'Plugins' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Creating Content' },
        { type: 'paragraph', content: LOREM_LONG },
        { type: 'heading', level: 2, content: 'Deploy' },
        { type: 'paragraph', content: LOREM_IPSUM },
      ]),
    },
  ] as const;

  let postsCreated = 0;
  for (const post of posts) {
    console.log('[seedDemoContent] Inserting post:', post.slug, 'tenantId:', tenantId, 'authorId:', authorId);
    const result = await sql.unsafe(
      // `$5::jsonb` parses (see the pages upsert above) — `to_jsonb($5::text)`
      // would store the document as a double-encoded jsonb string.
      `WITH upsert AS (
        UPDATE content
        SET title = $3,
            body = $5::jsonb,
            excerpt = $6,
            status = 'PUBLISHED',
            author_id = $7,
            published_at = $9,
            updated_at = $10
        WHERE tenant_id = $1 AND type = $2 AND slug = $4
        RETURNING id
      )
      INSERT INTO content (tenant_id, type, title, slug, body, excerpt, status, author_id, published_at, created_at, updated_at)
      SELECT $1, $2, $3, $4, $5::jsonb, $6, 'PUBLISHED', $7, $8, $9, $10
      WHERE NOT EXISTS (SELECT 1 FROM content WHERE tenant_id = $1 AND type = $2 AND slug = $4)
      RETURNING id`,
      [tenantId, post.type, post.title, post.slug, JSON.stringify(post.body), post.excerpt, authorId, now, now, now]
    );
    postsCreated += result.length;
  }

  // ---- MENUS ----
  const headerMenuItems = [
    { type: 'home', label: 'Home', url: '/' },
    { type: 'page', label: 'About', url: '/about', contentId: pageIds['about'] },
    { type: 'page', label: 'Blog', url: '/blog', contentId: pageIds['blog'] },
  ];
  const footerMenuItems = [
    { type: 'custom', label: 'Contact', url: '/#contact' },
    { type: 'custom', label: 'Privacy', url: '/privacy' },
  ];

  let menusCreated = 0;
  for (const [slug, name, items] of [
    ['header', 'Main Menu', headerMenuItems],
    ['footer', 'Footer', footerMenuItems],
  ] as const) {
    console.log('[seedDemoContent] Inserting menu:', slug, 'tenantId:', tenantId);
    const result = await sql.unsafe(
      // Column order is (name, slug) but the tuple is (slug, name) — the
      // params must swap accordingly, otherwise the menu lands with
      // slug='Main Menu' and the theme never finds `menus.header`.
      `INSERT INTO menus (tenant_id, name, slug, items)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id`,
      [tenantId, name, slug, items]
    );
    menusCreated += result.length;
  }

  // ---- READING SETTINGS (Static Front Page) ----
  let readingSettingsCreated = 0;
  if (pageIds['home'] && pageIds['blog']) {
    for (const [key, value] of [
      ['static_front_page', pageIds['home']],
      ['page_for_posts', pageIds['blog']],
      ['timezone_string', 'UTC'],
      ['gmt_offset', 0],
    ] as const) {
      console.log('[seedDemoContent] Inserting setting:', key, 'tenantId:', tenantId);
      const result = await sql.unsafe(
        `INSERT INTO settings (tenant_id, key, value, "group", type)
         VALUES ($1, $2, to_jsonb($3::text), 'reading', 'string')
         RETURNING id`,
        [tenantId, key, value]
      );
      readingSettingsCreated += result.length;
    }
  }

  return { pages: pagesCreated, posts: postsCreated, menus: menusCreated, readingSettings: readingSettingsCreated };
}

/** Activates the default theme when no active theme exists yet. */
export async function seedActivateDefaultTheme(
  sql: Sql = getConnection()
): Promise<void> {
  try {
    const tenantId = await resolveTenantId('default');
    
    // Check if an active theme already exists
    const activeTheme = await sql.unsafe(
      `SELECT id FROM themes WHERE status = 'ACTIVE' AND tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    
    if (activeTheme.length > 0) return;
    
    // Busca o tema default
    const defaultTheme = await sql.unsafe(
      `SELECT id FROM themes WHERE name = 'default' AND tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    
    if (defaultTheme.length > 0) {
      const row = defaultTheme[0];
      const themeId = row?.['id'];
      if (themeId) {
        await sql.unsafe(
          `UPDATE themes SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          [themeId]
        );
      }
    }
  } catch {
    // Silent — theme activation is best-effort
  }
}
