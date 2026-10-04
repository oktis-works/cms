// @oktis-works/web - B3: renderização real do site público (template + settings + assets)

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async () => []),
  })),
}));
vi.mock('@oktis-works/plugin-runtime', () => ({
  getHookRegistry: vi.fn(() => ({ addFilter: vi.fn(), doAction: vi.fn() })),
}));
vi.mock('@oktis-works/core', () => ({
  postTypeRegistry: { list: vi.fn(async () => []) },
  HOOK_POINTS: {},
}));

import {
  loadTemplateSource,
  renderContentPage,
  fetchSiteSettings,
  resolveThemeAssetPath,
  contentTypeForAsset,
} from './rendering.js';

let themesRoot: string;

beforeAll(() => {
  themesRoot = mkdtempSync(join(tmpdir(), 'okcms-themes-'));

  // Tema "mytheme": template específico + fallback no tema default
  mkdirSync(join(themesRoot, 'mytheme'), { recursive: true });
  writeFileSync(
    join(themesRoot, 'mytheme', 'post.astro'),
    `<main data-theme="{{site.theme}}"><h1>{{content.title}}</h1><div class="body">{{{content.html}}}</div></main>`
  );

  mkdirSync(join(themesRoot, 'default', 'dist'), { recursive: true });
  writeFileSync(
    join(themesRoot, 'default', 'single.astro'),
    `<main data-theme="{{site.theme}}"><h1>{{content.title}}</h1><p>{{site.description}}</p></main>`
  );
  writeFileSync(
    join(themesRoot, 'default', 'home.astro'),
    `<main><h1>{{site.title}}</h1>{{#if site.description}}<p>{{site.description}}</p>{{/if}}{{#if items}}<ul>{{#each items}}<li><a href="/{{slug}}">{{title}}</a></li>{{/each}}</ul>{{/if}}</main>`
  );
  writeFileSync(
    join(themesRoot, 'default', 'dist', 'theme.css'),
    '[data-theme="default"] main { color: red; }'
  );
});

afterAll(() => {
  rmSync(themesRoot, { recursive: true, force: true });
});

const settings = { siteTitle: 'Meu Site', siteDescription: 'Descrição do site' };
const resolution = { matched: true, template: 'single.astro', contentType: 'page', slug: 'sobre' };
const contentRow = { id: 'c1', title: 'Sobre nós', slug: 'sobre', type: 'page', body: { html: '<p>Conteúdo</p>' } };

describe('renderContentPage — B1 render real', () => {
  it('renderiza o conteúdo no template do tema ativo (body/campos)', () => {
    const html = renderContentPage({
      resolution: { matched: true, template: 'post.astro', contentType: 'post', slug: 'ola' },
      contentRow,
      data: contentRow['body'] as Record<string, unknown>,
      settings,
      activeTheme: 'mytheme',
      themesRoot,
    });

    expect(html).toContain('<h1>Sobre nós</h1>');
    expect(html).toContain('<div class="body"><p>Conteúdo</p></div>');
    expect(html).toContain('data-theme="mytheme"');
  });

  it('título da página usa siteTitle das settings (fim do OkCMS hardcoded)', () => {
    const html = renderContentPage({
      resolution: { matched: true, template: 'home.astro' },
      contentRow: null,
      data: {},
      settings,
      activeTheme: 'default',
      themesRoot,
    });

    expect(html).toContain('<h1>Meu Site</h1>');
    expect(html).not.toContain('OkCMS');
    expect(html).toContain('Descrição do site');
  });

  it('meta description = siteDescription nas settings', () => {
    const html = renderContentPage({
      resolution: { matched: true, template: 'home.astro' },
      contentRow: null,
      data: {},
      settings,
      activeTheme: 'default',
      themesRoot,
    });

    expect(html).toContain('Descrição do site');
  });

  it('fallback: template default quando o específico não existe no tema ativo', () => {
    // mytheme não tem single.astro — cai no default
    const html = renderContentPage({
      resolution,
      contentRow,
      data: {},
      settings,
      activeTheme: 'mytheme',
      themesRoot,
    });

    expect(html).toContain('<h1>Sobre nós</h1>');
    expect(html).toContain('Descrição do site');
  });

  it('escapa variáveis interpoladas ({{var}}) e mantém raw ({{{var}}})', () => {
    const html = renderContentPage({
      resolution: { matched: true, template: 'post.astro', contentType: 'post', slug: 'ola' },
      contentRow: { ...contentRow, title: '<script>x</script>' },
      data: { html: '<p>ok</p>' },
      settings,
      activeTheme: 'mytheme',
      themesRoot,
    });

    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('<p>ok</p>');
  });

  it('archive/home lista itens reais', () => {
    const html = renderContentPage({
      resolution: { matched: true, template: 'home.astro' },
      contentRow: null,
      data: {},
      items: [
        { title: 'Primeiro post', slug: 'primeiro' },
        { title: 'Segundo post', slug: 'segundo' },
      ],
      settings,
      activeTheme: 'default',
      themesRoot,
    });

    expect(html).toContain('Primeiro post');
    expect(html).toContain('href="/primeiro"');
    expect(html).toContain('href="/segundo"');
  });

  it('lista vazia não renderiza a section de itens', () => {
    const html = renderContentPage({
      resolution: { matched: true, template: 'home.astro' },
      contentRow: null,
      data: {},
      items: [],
      settings,
      activeTheme: 'default',
      themesRoot,
    });

    expect(html).not.toContain('<ul>');
  });
});

describe('loadTemplateSource — B1 cadeia de fallback', () => {
  it('tema ativo → default', () => {
    expect(loadTemplateSource(themesRoot, 'mytheme', 'single.astro')).toContain('data-theme');
    expect(loadTemplateSource(themesRoot, 'inexistente', 'single.astro')).toContain('data-theme');
  });

  it('arquivo inexistente → null', () => {
    expect(loadTemplateSource(themesRoot, 'mytheme', 'nao-existe.astro')).toBeNull();
  });
});

describe('fetchSiteSettings — B1 settings do site', () => {
  it('lê siteTitle/siteDescription das settings', async () => {
    const { getConnection } = await import('@oktis-works/database');
    const sql = {
      unsafe: vi.fn(async () => [
        { key: 'siteTitle', value: 'Título do Banco' },
        { key: 'siteDescription', value: 'Descrição do Banco' },
      ]),
    };
    (getConnection as ReturnType<typeof vi.fn>).mockReturnValueOnce(sql as never);

    const result = await fetchSiteSettings(sql as never);
    expect(result.siteTitle).toBe('Título do Banco');
    expect(result.siteDescription).toBe('Descrição do Banco');
  });

  it('falha de banco → fallbacks locais', async () => {
    const sql = {
      unsafe: vi.fn(async () => {
        throw new Error('db down');
      }),
    };
    const result = await fetchSiteSettings(sql as never);
    expect(result.siteTitle).toBe('OkCMS');
    expect(result.siteDescription).toBe('');
  });
});

describe('resolveThemeAssetPath — B2 traversal guard', () => {
  it('asset dentro do tema resolve', () => {
    const target = resolveThemeAssetPath(themesRoot, 'default', 'dist/theme.css');
    expect(target).toContain(join('default', 'dist', 'theme.css'));
  });

  it('.. que escapa do tema é negado', () => {
    expect(resolveThemeAssetPath(themesRoot, 'default', '../../../etc/passwd')).toBeNull();
    expect(resolveThemeAssetPath(themesRoot, 'default', 'dist/../../secrets.json')).toBeNull();
  });

  it('nome de tema inválido é negado', () => {
    expect(resolveThemeAssetPath(themesRoot, '../outside', 'x.css')).toBeNull();
    expect(resolveThemeAssetPath(themesRoot, '', 'x.css')).toBeNull();
  });
});

describe('contentTypeForAsset — B2 mime types', () => {
  it('mapeia extensões comuns', () => {
    expect(contentTypeForAsset('theme.css')).toContain('text/css');
    expect(contentTypeForAsset('app.js')).toContain('text/javascript');
    expect(contentTypeForAsset('logo.svg')).toContain('image/svg');
    expect(contentTypeForAsset('font.woff2')).toContain('font/woff2');
    expect(contentTypeForAsset('arquivo.desconhecido')).toBe('application/octet-stream');
  });
});
