// @oktis-works/database - Seeds de dados padrão (roles + settings)
//
// - As 5 roles do DEFAULT_POLICY do @oktis-works/auth precisam EXISTIR no
//   banco: o JWT carrega só os slugs (lidos de roles via tenant_users) e sem
//   a linha da role o usuário nasce sem papel → 403 em toda rota protegida
//   (registrava, logava, mas não operava nada).
// - Settings do grupo `general` para o admin ter o que editar (a tabela
//   nasce vazia).
//
// Idempotente: roda em QUALQUER banco (fresco ou existente) sem duplicar —
// roles via WHERE NOT EXISTS, settings via ON CONFLICT (UNIQUE(key,tenant)).

import { getConnection } from '../connection.js';
import { resolveTenantId } from './bootstrap.js';
import type postgres from 'postgres';

type Sql = postgres.Sql;

/** Roles canônicas — DEVEM casar com os slugs do DEFAULT_POLICY do auth. */
export const DEFAULT_ROLES = [
  { name: 'Super Admin', slug: 'SUPER_ADMIN' },
  { name: 'Administrador', slug: 'TENANT_ADMIN' },
  { name: 'Editor', slug: 'EDITOR' },
  { name: 'Autor', slug: 'AUTHOR' },
  { name: 'Leitor', slug: 'VIEWER' },
] as const;

/** Settings iniciais do grupo `general` (form de Settings → General da admin). */
export const DEFAULT_SETTINGS = [
  { key: 'siteTitle', value: 'Meu Site', type: 'string' },
  { key: 'siteDescription', value: 'Um novo site feito com OkCMS', type: 'string' },
  { key: 'language', value: 'pt-BR', type: 'string' },
  { key: 'timezone', value: 'America/Sao_Paulo', type: 'string' },
] as const;

/** Cria (se faltar) as roles globais (tenant_id NULL) da política. Retorna qtd criada. */
export async function seedDefaultRoles(sql: Sql = getConnection()): Promise<number> {
  let inserted = 0;
  for (const role of DEFAULT_ROLES) {
    // Cast explícito: $2 aparece em dois contextos (valor de inserção e
    // comparação de coluna) — sem cast o Postgres deduz tipos diferentes
    // para o mesmo parâmetro e falha com "inconsistent types deduced".
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

/** Cria (se faltar) os settings iniciais no tenant dado. Retorna qtd criada. */
export async function seedDefaultSettings(
  tenantId: string,
  sql: Sql = getConnection()
): Promise<number> {
  let inserted = 0;
  for (const s of DEFAULT_SETTINGS) {
    // RETURNING: sem ele o driver devolve [] mesmo com insert bem-sucedido
    // (contaria 0 no log e quebraria a detecção de idempotência).
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
 * `db:migrate`/`seed` da CLI e como fallback no registro do primeiro usuário.
 */
export async function seedCoreData(
  sql: Sql = getConnection()
): Promise<{ roles: number; settings: number }> {
  const roles = await seedDefaultRoles(sql);
  const tenantId = await resolveTenantId('default');
  const settings = await seedDefaultSettings(tenantId, sql);
  return { roles, settings };
}

/** Lorem ipsum curto para campos de texto. */
const LOREM_IPSUM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

/** Lorem ipsum longo para conteúdo de posts/páginas. */
const LOREM_LONG = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
`;

/** Estrutura padrão do body do editor (blocos + html renderizado). */
function makeBody(html: string, blocks: unknown[] = []): Record<string, unknown> {
  return {
    html,
    blocks: blocks.length > 0 ? blocks : [
      { type: 'paragraph', content: html.replace(/<[^>]*>/g, '').slice(0, 200) },
    ],
  };
}

/**
 * Seed de conteúdo demonstrativo (páginas, posts, menus, settings de leitura).
 * Idempotente: usa ON CONFLICT em content (tenant_id, type, slug), menus (tenant_id, slug),
 * e settings (key, tenant_id).
 */
export async function seedDemoContent(
  sql: Sql = getConnection()
): Promise<{ pages: number; posts: number; menus: number; readingSettings: number }> {
  const tenantId = await resolveTenantId('default');

  // Autor padrão: primeiro usuário do tenant (ou cria um se não houver)
  const authorResult = await sql.unsafe(
    `SELECT id FROM users WHERE id IN (SELECT user_id FROM tenant_users WHERE tenant_id = $1) LIMIT 1`,
    [tenantId]
  );
  let authorId: string;
  if (authorResult.length === 0) {
    // Fallback: cria usuário admin se não houver nenhum
    const newUser = await sql.unsafe(
      `INSERT INTO users (email, name, password_hash, status)
       VALUES ('admin@local', 'Administrador', '$2b$10$dummy', 'ACTIVE')
       RETURNING id`
    );
    authorId = String(newUser[0]?.['id'] ?? '');
    await sql.unsafe(
      `INSERT INTO tenant_users (tenant_id, user_id, role_id)
       SELECT $1, $2, id FROM roles WHERE slug = 'TENANT_ADMIN' AND tenant_id = $1 LIMIT 1`,
      [tenantId, authorId]
    );
  } else {
    authorId = String(authorResult[0]?.['id'] ?? '');
  }

  const now = new Date();

  // ---- PÁGINAS ----
  const pages = [
    {
      type: 'page',
      slug: 'home',
      title: 'Início',
      excerpt: 'Bem-vindo ao seu novo site com OkCMS.',
      body: makeBody(`
        <section class="hero">
          <h1>Bem-vindo ao OkCMS</h1>
          <p>Seu novo site está pronto para personalizar.</p>
          <a href="/blog" class="btn btn-primary">Ver Blog</a>
        </section>
        <section id="sobre" class="about-preview">
          <h2>Sobre Nós</h2>
          <p>${LOREM_IPSUM}</p>
          <a href="/sobre">Ler mais →</a>
        </section>
        <section class="latest-posts">
          <h2>Últimos Artigos</h2>
          <p>Os artigos mais recentes aparecerão aqui automaticamente.</p>
        </section>
        <section id="contato" class="contact">
          <h2>Entre em Contato</h2>
          <p>Preencha o formulário ou envie um e-mail para contato@exemplo.com</p>
        </section>
      `, [
        { type: 'heading', level: 1, content: 'Bem-vindo ao OkCMS' },
        { type: 'paragraph', content: 'Seu novo site está pronto para personalizar.' },
        { type: 'heading', level: 2, content: 'Sobre Nós' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Últimos Artigos' },
        { type: 'paragraph', content: 'Os artigos mais recentes aparecerão aqui automaticamente.' },
        { type: 'heading', level: 2, content: 'Entre em Contato' },
        { type: 'paragraph', content: 'Preencha o formulário ou envie um e-mail para contato@exemplo.com' },
      ]),
    },
    {
      type: 'page',
      slug: 'sobre',
      title: 'Sobre Nós',
      excerpt: 'Conheça nossa história e missão.',
      body: makeBody(`
        <h2>Nossa História</h2>
        <p>${LOREM_LONG}</p>
        <h2>Nossa Missão</h2>
        <p>${LOREM_IPSUM}</p>
        <h2>Equipe</h2>
        <p>${LOREM_IPSUM}</p>
      `, [
        { type: 'heading', level: 2, content: 'Nossa História' },
        { type: 'paragraph', content: LOREM_LONG },
        { type: 'heading', level: 2, content: 'Nossa Missão' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Equipe' },
        { type: 'paragraph', content: LOREM_IPSUM },
      ]),
    },
    {
      type: 'page',
      slug: 'blog',
      title: 'Blog',
      excerpt: 'Artigos, tutoriais e novidades.',
      body: makeBody(`
        <p>Bem-vindo ao nosso blog. Aqui você encontrará artigos, tutoriais e novidades sobre OkCMS.</p>
        <p>Os posts mais recentes são listados abaixo automaticamente.</p>
      `, [
        { type: 'paragraph', content: 'Bem-vindo ao nosso blog. Aqui você encontrará artigos, tutoriais e novidades sobre OkCMS.' },
        { type: 'paragraph', content: 'Os posts mais recentes são listados abaixo automaticamente.' },
      ]),
    },
  ] as const;

  let pagesCreated = 0;
  const pageIds: Record<string, string> = {};

  for (const page of pages) {
    const result = await sql.unsafe(
      `INSERT INTO content (tenant_id, type, title, slug, body, excerpt, status, author_id, published_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, to_jsonb($5::text), $6, 'PUBLISHED', $7, $8, $9, $10)
       ON CONFLICT (tenant_id, type, slug) DO UPDATE SET
         title = EXCLUDED.title,
         body = to_jsonb(EXCLUDED.body::text),
         excerpt = EXCLUDED.excerpt,
         status = EXCLUDED.status,
         author_id = EXCLUDED.author_id,
         published_at = EXCLUDED.published_at,
         updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [tenantId, page.type, page.title, page.slug, JSON.stringify(page.body), page.excerpt, authorId, now, now, now]
    );
    pagesCreated += result.length;
    pageIds[page.slug] = String(result[0]?.['id'] ?? '');
  }

  // ---- POSTS ----
  const posts = [
    {
      type: 'post',
      slug: 'primeiro-post',
      title: 'Primeiro Artigo do Blog',
      excerpt: 'Este é o primeiro artigo de demonstração do blog.',
      body: makeBody(`
        <h1>Primeiro Artigo do Blog</h1>
        <p>${LOREM_IPSUM}</p>
        <h2>Introdução</h2>
        <p>${LOREM_LONG}</p>
        <h2>Desenvolvimento</h2>
        <p>${LOREM_IPSUM}</p>
        <h3>Subseção Exemplo</h3>
        <p>${LOREM_IPSUM}</p>
        <h2>Conclusão</h2>
        <p>${LOREM_LONG}</p>
      `, [
        { type: 'heading', level: 1, content: 'Primeiro Artigo do Blog' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Introdução' },
        { type: 'paragraph', content: LOREM_LONG },
        { type: 'heading', level: 2, content: 'Desenvolvimento' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 3, content: 'Subseção Exemplo' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Conclusão' },
        { type: 'paragraph', content: LOREM_LONG },
      ]),
    },
    {
      type: 'post',
      slug: 'segundo-post',
      title: 'Dicas para Começar com OkCMS',
      excerpt: 'Aprenda os primeiros passos para criar seu site com OkCMS.',
      body: makeBody(`
        <h1>Dicas para Começar com OkCMS</h1>
        <p>${LOREM_IPSUM}</p>
        <h2>Instalação</h2>
        <p>${LOREM_LONG}</p>
        <h2>Configuração Inicial</h2>
        <p>${LOREM_IPSUM}</p>
        <h3>Temas</h3>
        <p>${LOREM_IPSUM}</p>
        <h3>Plugins</h3>
        <p>${LOREM_IPSUM}</p>
        <h2>Criando Conteúdo</h2>
        <p>${LOREM_LONG}</p>
        <h2>Deploy</h2>
        <p>${LOREM_IPSUM}</p>
      `, [
        { type: 'heading', level: 1, content: 'Dicas para Começar com OkCMS' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Instalação' },
        { type: 'paragraph', content: LOREM_LONG },
        { type: 'heading', level: 2, content: 'Configuração Inicial' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 3, content: 'Temas' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 3, content: 'Plugins' },
        { type: 'paragraph', content: LOREM_IPSUM },
        { type: 'heading', level: 2, content: 'Criando Conteúdo' },
        { type: 'paragraph', content: LOREM_LONG },
        { type: 'heading', level: 2, content: 'Deploy' },
        { type: 'paragraph', content: LOREM_IPSUM },
      ]),
    },
  ] as const;

  let postsCreated = 0;
  for (const post of posts) {
    const result = await sql.unsafe(
      `INSERT INTO content (tenant_id, type, title, slug, body, excerpt, status, author_id, published_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, to_jsonb($5::text), $6, 'PUBLISHED', $7, $8, $9, $10)
       ON CONFLICT (tenant_id, type, slug) DO UPDATE SET
         title = EXCLUDED.title,
         body = to_jsonb(EXCLUDED.body::text),
         excerpt = EXCLUDED.excerpt,
         status = EXCLUDED.status,
         author_id = EXCLUDED.author_id,
         published_at = EXCLUDED.published_at,
         updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [tenantId, post.type, post.title, post.slug, JSON.stringify(post.body), post.excerpt, authorId, now, now, now]
    );
    postsCreated += result.length;
  }

  // ---- MENUS ----
  const headerMenuItems = [
    { type: 'home', label: 'Início', url: '/' },
    { type: 'page', label: 'Sobre', url: '/sobre', contentId: pageIds['sobre'] },
    { type: 'page', label: 'Blog', url: '/blog', contentId: pageIds['blog'] },
  ];
  const footerMenuItems = [
    { type: 'custom', label: 'Contato', url: '/#contato' },
    { type: 'custom', label: 'Privacidade', url: '/privacidade' },
  ];

  let menusCreated = 0;
  for (const [slug, name, items] of [
    ['header', 'Menu Principal', headerMenuItems],
    ['footer', 'Rodapé', footerMenuItems],
  ] as const) {
    const result = await sql.unsafe(
      `INSERT INTO menus (tenant_id, name, slug, items)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (tenant_id, slug) DO UPDATE SET
         name = EXCLUDED.name,
         items = EXCLUDED.items
       RETURNING id`,
      [tenantId, name, slug, items]
    );
    menusCreated += result.length;
  }

  // ---- SETTINGS DE LEITURA (Static Front Page) ----
  let readingSettingsCreated = 0;
  if (pageIds['home'] && pageIds['blog']) {
    for (const [key, value] of [
      ['static_front_page', pageIds['home']],
      ['page_for_posts', pageIds['blog']],
    ] as const) {
      const result = await sql.unsafe(
        `INSERT INTO settings (tenant_id, key, value, "group", type)
         VALUES ($1, $2, to_jsonb($3::text), 'reading', 'string')
         ON CONFLICT (key, tenant_id) DO UPDATE SET value = to_jsonb($3::text)
         RETURNING id`,
        [tenantId, key, value]
      );
      readingSettingsCreated += result.length;
    }
  }

  return { pages: pagesCreated, posts: postsCreated, menus: menusCreated, readingSettings: readingSettingsCreated };
}
