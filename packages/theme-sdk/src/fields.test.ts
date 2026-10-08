// @oktis-works/theme-sdk - API contextual (setCurrentContent) + campos padrão

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getField,
  getFields,
  getFlexibleLayouts,
  getCurrentContent,
  clearCurrentContent,
  runWithCurrentContent,
  setThemeHooks,
  getStandardFields,
  type ContentLike,
} from './fields.js';

const row: ContentLike = {
  id: 'c-1',
  type: 'post',
  title: 'Olá mundo',
  slug: 'ola-mundo',
  excerpt: 'resumo',
  status: 'PUBLISHED',
  featuredImageId: 'm-9',
  seoTitle: 'SEO título',
  version: 3,
  body: { subtitulo: 'custom', galeria: ['a', 'b'] },
};

beforeEach(() => {
  clearCurrentContent();
  setThemeHooks(null as never);
});

describe('contexto por request (AsyncLocalStorage)', () => {
  it('getField(name) sem props lê do conteúdo corrente', () => {
    runWithCurrentContent(row, () => {
      expect(getField('subtitulo')).toBe('custom');
      expect(getField('title')).toBe('Olá mundo');
    });
    expect(getCurrentContent()).toBeNull();
  });

  it('contextos concorrentes ficam isolados', async () => {
    const other: ContentLike = { title: 'Outro', body: { subtitulo: 'x' } };

    await Promise.all([
      runWithCurrentContent(row, async () => {
        await new Promise((r) => setTimeout(r, 5));
        expect(getField('title')).toBe('Olá mundo');
      }),
      runWithCurrentContent(other, async () => {
        await new Promise((r) => setTimeout(r, 1));
        expect(getField('title')).toBe('Outro');
      }),
    ]);
  });

  it('forma explícita continua funcionando e vence o contexto', () => {
    runWithCurrentContent(row, () => {
      const explicit: ContentLike = { title: 'Explícito' };
      expect(getField(explicit, 'title')).toBe('Explícito');
      expect(getField({ ...row }, 'title')).toBe('Olá mundo');
    });
  });

  it('sem contexto e sem argumento retorna vazio/undefined sem lançar', () => {
    expect(getFields()).toEqual({});
    expect(getField('title')).toBeUndefined();
    expect(getFlexibleLayouts('secoes')).toEqual([]);
  });
});

describe('campos padrão + customizados', () => {
  it('getFields mescla padrão + custom (custom sobrescreve)', () => {
    const merged = getFields({ ...row, title: 'custom-title', body: { title: 'custom-title', x: 1 } });
    expect(merged['title']).toBe('custom-title');
    expect(merged['slug']).toBe('ola-mundo');
    expect(merged['excerpt']).toBe('resumo');
    expect(merged['x']).toBe(1);
    expect(merged['featuredImageId']).toBe('m-9');
    expect(merged['seoTitle']).toBe('SEO título');
  });

  it('resolve snake_case de rows cruas do banco', () => {
    const raw = { title: 'Raw', featured_image_id: 'm-raw', seo_title: 's' };
    expect(getField(raw, 'featuredImageId')).toBe('m-raw');
    expect(getStandardFields(raw as ContentLike)['featuredImageId']).toBe('m-raw');
  });

  it('custom tem prioridade sobre coluna nativa no getField', () => {
    expect(getField({ title: 'coluna', body: { title: 'custom' } }, 'title')).toBe('custom');
    expect(getField({ title: 'coluna' }, 'title')).toBe('coluna');
  });
});

describe('filtros theme:data:* no modo contextual', () => {
  it('plugins transformam valores via filtro', () => {
    setThemeHooks({
      applyFilters: (_f: string, value: unknown, args?: Record<string, unknown>) => (args?.['name'] === 'secret' ? '[FILTERED]' : value),
      applyFiltersAsync: async (_f, value) => value,
    });

    runWithCurrentContent(row, () => {
      expect(getField('secret')).toBe('[FILTERED]');
      expect(Object.keys(getFields())).not.toContain('secret');
    });
  });
});

describe('getFlexibleLayouts contextual', () => {
  it('lê seções do campo flexible sem props', () => {
    const withFlex: ContentLike = {
      body: {
        secoes: [
          { fc_layout: 'hero', titulo: 'Olá' }, // formato real persistido
          { layout: 'hero', data: { t: 1 } }, // formato legado
          { layout: 'grid', data: {} },
          'inválido',
        ],
      },
    };

    runWithCurrentContent(withFlex, () => {
      expect(getFlexibleLayouts('secoes')).toEqual([
        { layout: 'hero', data: { titulo: 'Olá' } },
        { layout: 'hero', data: { t: 1 } },
        { layout: 'grid', data: {} },
      ]);
    });
  });
});
