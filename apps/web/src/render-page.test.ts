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

// Shared registry instance: renderContentPage calls getHookRegistry() at
// render time, so tests must mutate THIS object (not a per-call fresh one).
const { sharedRegistry } = vi.hoisted(() => ({
  sharedRegistry: {
    addFilter: vi.fn(),
    doAction: vi.fn(),
    applyFilters: vi.fn((hook: string, value: unknown, ..._rest: unknown[]) => value),
  },
}));

vi.mock('@oktis-works/plugin-runtime', () => ({
  getHookRegistry: vi.fn(() => sharedRegistry),
}));
vi.mock('@oktis-works/core', () => ({
  postTypeRegistry: { list: vi.fn(async () => []) },
  HOOK_POINTS: {
    THEME_HEAD: 'theme:head',
    THEME_BEFORE_RENDER: 'theme:before:render',
    THEME_AFTER_RENDER: 'theme:after:render',
  },
}));

import {
  createTemplateChecker,
  loadTemplateSource,
  renderContentPage,
  toSiteSettings,
  resolveThemeAssetPath,
  resolveThemeStylesheet,
  contentTypeForAsset,
  wrapDocument,
  mergePreviewSettings,
} from './rendering.js';
import { getHookRegistry } from '@oktis-works/plugin-runtime';
import { CMS_VERSION } from '@oktis-works/validation';

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

const settings = { siteTitle: 'Meu Site', siteDescription: 'Descrição do site', language: 'pt-BR' };
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
    // O fallback hardcoded antigo era <title>OkCMS</title> — o ÚNICO "OkCMS"
    // permitido no documento agora é o <meta name="generator"> (assinatura).
    expect(html).not.toContain('<title>OkCMS');
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

describe('loadTemplateSource — B1 cadeia de fallback (fonte única: theme-runtime)', () => {
  it('tema ativo → default', () => {
    expect(loadTemplateSource(themesRoot, 'mytheme', 'single.astro')).toContain('data-theme');
    expect(loadTemplateSource(themesRoot, 'inexistente', 'single.astro')).toContain('data-theme');
  });

  it('cadeia inclui _shared (partials de projeto independentes do tema)', () => {
    mkdirSync(join(themesRoot, '_shared'), { recursive: true });
    writeFileSync(join(themesRoot, '_shared', 'partial.astro'), '<p>compartilhado</p>');
    expect(loadTemplateSource(themesRoot, 'mytheme', 'partial.astro')).toContain('compartilhado');
  });

  it('nome de tema inválido é saneado (cai no default)', () => {
    // activeTheme com path/hostile não pode sair da raiz de temas
    expect(loadTemplateSource(themesRoot, '../fora', 'single.astro')).toContain('data-theme');
  });

  it('guard de traversal nega arquivo fora do tema', () => {
    expect(loadTemplateSource(themesRoot, 'mytheme', '../default/single.astro')).toBeNull();
    expect(loadTemplateSource(themesRoot, 'mytheme', '/etc/passwd')).toBeNull();
  });

  it('arquivo inexistente → null', () => {
    expect(loadTemplateSource(themesRoot, 'mytheme', 'nao-existe.astro')).toBeNull();
  });
});

describe('createTemplateChecker — hierarquia consome o mesmo resolver', () => {
  it('exists cobre a cadeia ativo → _shared → default', () => {
    const checker = createTemplateChecker(themesRoot, 'mytheme');
    expect(checker.exists('post.astro')).toBe(true);
    expect(checker.exists('single.astro')).toBe(true);
    expect(checker.exists('nao-existe.astro')).toBe(false);
  });
});

describe('toSiteSettings — B1 settings do site (via ThemeDataProvider)', () => {
  it('mapeia siteTitle/siteDescription/language com fallbacks', () => {
    const result = toSiteSettings({
      siteTitle: 'Título do Banco',
      siteDescription: 'Descrição do Banco',
      language: 'en-US',
      timezone: 'UTC',
    });
    expect(result.siteTitle).toBe('Título do Banco');
    expect(result.siteDescription).toBe('Descrição do Banco');
    expect(result.language).toBe('en-US');
  });

  it('settings vazias/faltando → fallbacks locais', () => {
    const result = toSiteSettings({});
    expect(result.siteTitle).toBe('OkCMS');
    expect(result.siteDescription).toBe('');
    expect(result.language).toBe('pt-BR');
  });

  it('valores não-texto (null/número) são tratados de forma robusta', () => {
    const result = toSiteSettings({ siteTitle: null as unknown as string, siteDescription: 123 as unknown as string });
    expect(result.siteTitle).toBe('OkCMS');
    expect(result.siteDescription).toBe('123');
  });
});

describe('resolveThemeStylesheet — link só quando dist/theme.css existe', () => {
  it('segue a cadeia ativo → _shared → default', () => {
    // default/ dist/theme.css existe (fixture do beforeAll); mytheme não
    expect(resolveThemeStylesheet(themesRoot, 'mytheme')).toBe('default');
    expect(resolveThemeStylesheet(themesRoot, 'default')).toBe('default');
  });

  it('null quando ninguém compilou estilos (documento sai sem <link> quebrado)', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'okcms-no-css-'));
    try {
      mkdirSync(join(emptyRoot, 'sem-estilos'), { recursive: true });
      expect(resolveThemeStylesheet(emptyRoot, 'sem-estilos')).toBeNull();

      const html = renderContentPage({
        resolution: { matched: true, template: 'single.astro', contentType: 'page', slug: 'sobre' },
        contentRow,
        data: contentRow['body'] as Record<string, unknown>,
        settings,
        activeTheme: 'sem-estilos',
        themesRoot: emptyRoot,
      });
      expect(html).not.toContain('rel="stylesheet"');
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it('renderContentPage linka o css do fornecedor real (default quando o ativo não compila)', () => {
    const html = renderContentPage({
      resolution: { matched: true, template: 'post.astro', contentType: 'post', slug: 'ola' },
      contentRow,
      data: contentRow['body'] as Record<string, unknown>,
      settings,
      activeTheme: 'mytheme',
      themesRoot,
    });
    expect(html).toContain('href="/themes/default/dist/theme.css"');
    expect(html).not.toContain('href="/themes/mytheme/dist/theme.css"');
  });
});

describe('wrapDocument — idioma do documento vem das settings', () => {
  it('usa settings.language (não mais pt-BR hardcoded)', () => {
    const html = wrapDocument('<main>corpo</main>', 'Título', { ...settings, language: 'en-US' }, 'default', null);
    expect(html).toContain('<html lang="en-US">');
    expect(html).not.toContain('data-theme-style');
  });

  it('fallback pt-BR e link do tema quando o stylesheet existe', () => {
    const html = wrapDocument('<main>corpo</main>', 'Título', settings, 'default', 'default');
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('<link rel="stylesheet" href="/themes/default/dist/theme.css"');
  });
});

describe('wrapDocument — assinatura do produto (meta generator)', () => {
  it('emite <meta name="generator" content="OkCMS <CMS_VERSION>" em todo documento', () => {
    const html = wrapDocument('<main>corpo</main>', 'Título', settings, 'default', null);
    expect(html).toContain(`<meta name="generator" content="OkCMS ${CMS_VERSION}">`);
  });

  it('documento COMPLETO do tema (full-control) passa intocado — sem meta injetado', () => {
    const full = '<!DOCTYPE html><html><head><title>x</title></head><body>y</body></html>';
    expect(wrapDocument(full, 'Título', settings, 'default', 'default')).toBe(full);
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

describe('renderContentPage — E5 render hooks (theme:before/after:render)', () => {
  const hookSettings = { siteTitle: 'Hook Site', siteDescription: '', language: 'pt-BR' };

  function withApplyFilters(
    impl: (hook: string, value: unknown, ...rest: unknown[]) => unknown,
    run: () => void
  ): void {
    const registry = getHookRegistry() as unknown as { applyFilters: ReturnType<typeof vi.fn> };
    const original = registry.applyFilters.getMockImplementation();
    registry.applyFilters.mockImplementation(impl);
    try {
      run();
    } finally {
      registry.applyFilters.mockImplementation(original ?? ((_hook: string, value: unknown) => value));
    }
  }

  it('theme:before:render lets a plugin transform the render data (document → HTML)', () => {
    writeFileSync(
      join(themesRoot, 'mytheme', 'hookdata.astro'),
      '<main data-hook>{{content.compiled}}</main>'
    );
    withApplyFilters(
      (hook, value) =>
        hook === 'theme:before:render' && value && typeof value === 'object'
          ? { ...(value as Record<string, unknown>), compiled: 'COMPILED-HTML' }
          : value,
      () => {
        const html = renderContentPage({
          resolution: { matched: true, template: 'hookdata.astro', contentType: 'post', slug: 'hooked' },
          contentRow: { title: 'Hooked', slug: 'hooked', type: 'post' },
          data: {},
          settings: hookSettings,
          themesRoot,
          activeTheme: 'mytheme',
        });
        expect(html).toContain('COMPILED-HTML');
      }
    );
  });

  it('theme:after:render lets a plugin post-process the final document', () => {
    withApplyFilters(
      (hook, value) => (hook === 'theme:after:render' ? `${String(value)}<!--after-hook-->'` : value),
      () => {
        const html = renderContentPage({
          resolution: { matched: true, template: 'post.astro', contentType: 'post', slug: 'ola' },
          contentRow,
          data: { html: '<p>x</p>' },
          settings: hookSettings,
          themesRoot,
          activeTheme: 'mytheme',
        });
        expect(html).toContain('<!--after-hook-->');
      }
    );
  });

  it('passes hook context (template/contentType/slug/activeTheme) to both filters', () => {
    const seen: Array<{ hook: string; context: Record<string, unknown> }> = [];
    withApplyFilters(
      (hook, value, context) => {
        if (hook === 'theme:before:render' || hook === 'theme:after:render') {
          seen.push({ hook, context: (context ?? {}) as Record<string, unknown> });
        }
        return value;
      },
      () => {
        renderContentPage({
          resolution: { matched: true, template: 'post.astro', contentType: 'post', slug: 'ola' },
          contentRow,
          data: {},
          settings: hookSettings,
          themesRoot,
          activeTheme: 'mytheme',
        });
      }
    );
    expect(seen.map((entry) => entry.hook)).toEqual(['theme:before:render', 'theme:after:render']);
    expect(seen[0]?.context).toMatchObject({ template: 'post.astro', contentType: 'post', slug: 'ola', activeTheme: 'mytheme' });
  });
});

describe('mergePreviewSettings — Item 7 customizer preview', () => {
  it('overlays draft settings over the saved config (request-only)', () => {
    const merged = mergePreviewSettings({ primary: '#000', title: 'Saved' }, encodeURIComponent(JSON.stringify({ primary: '#f00' })));
    expect(merged).toEqual({ primary: '#f00', title: 'Saved' });
  });

  it('returns the saved config untouched without the param', () => {
    const saved = { primary: '#000' };
    expect(mergePreviewSettings(saved, undefined)).toBe(saved);
    expect(mergePreviewSettings(null, undefined)).toBeNull();
  });

  it('ignores invalid payloads (degrades to saved config)', () => {
    expect(mergePreviewSettings({ a: 1 }, 'not-json')).toEqual({ a: 1 });
    expect(mergePreviewSettings({ a: 1 }, encodeURIComponent(JSON.stringify(['array'])))).toEqual({ a: 1 });
    expect(mergePreviewSettings({ a: 1 }, encodeURIComponent(JSON.stringify('string')))).toEqual({ a: 1 });
    expect(mergePreviewSettings(null, 'garbage')).toBeNull();
  });
});
