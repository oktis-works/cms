// @oktis-works/core - Field Validation Tests

import { describe, it, expect } from 'vitest';
import { validateContentData } from './validation.js';

const base = (partial: Record<string, unknown>) => ({
  type: 'text',
  name: 'f',
  label: 'Campo',
  required: false,
  config: {},
  conditionalLogic: null,
  ...partial,
});

describe('validateContentData', () => {
  it('required falha para vazio e passa para preenchido', () => {
    const fields = [base({ type: 'text', name: 'titulo', label: 'Título', required: true })];

    const missing = validateContentData(fields, {});
    expect(missing.valid).toBe(false);
    expect(missing.errors[0]?.code).toBe('REQUIRED');

    const present = validateContentData(fields, { titulo: 'Olá' });
    expect(present.valid).toBe(true);
  });

  it('characterLimit limita tamanho do texto', () => {
    const fields = [base({ type: 'text', name: 'resumo', config: { characterLimit: 5 } })];

    const result = validateContentData(fields, { resumo: '123456' });
    expect(result.errors.some((error) => error.code === 'CHARACTER_LIMIT')).toBe(true);
  });

  it('valida email e URL', () => {
    const emailFields = [base({ type: 'email', name: 'email', required: true })];
    expect(validateContentData(emailFields, { email: 'invalido' }).errors.some((e) => e.code === 'INVALID_EMAIL')).toBe(true);
    expect(validateContentData(emailFields, { email: 'a@b.co' }).valid).toBe(true);

    const urlFields = [base({ type: 'url', name: 'site', required: true })];
    expect(validateContentData(urlFields, { site: 'nao-url' }).errors.some((e) => e.code === 'INVALID_URL')).toBe(true);
    expect(validateContentData(urlFields, { site: 'https://x.com' }).valid).toBe(true);
  });

  it('number respeita minValue/maxValue/stepValue', () => {
    const fields = [
      base({
        type: 'number',
        name: 'qtd',
        required: true,
        config: { minValue: 2, maxValue: 10, step: 2 },
      }),
    ];

    expect(validateContentData(fields, { qtd: 1 }).errors.some((e) => e.code === 'MIN_VALUE')).toBe(true);
    expect(validateContentData(fields, { qtd: 11 }).errors.some((e) => e.code === 'MAX_VALUE')).toBe(true);
    expect(validateContentData(fields, { qtd: 3 }).errors.some((e) => e.code === 'STEP_MISMATCH')).toBe(true);
    expect(validateContentData(fields, { qtd: 4 }).valid).toBe(true);
  });

  it('select/checkbox/radio validam choices', () => {
    const selectFields = [
      base({
        type: 'select',
        name: 'cor',
        required: true,
        config: { choices: [{ value: 'azul', label: 'Azul' }, { value: 'verde', label: 'Verde' }] },
      }),
    ];
    expect(validateContentData(selectFields, { cor: 'roxo' }).errors.some((e) => e.code === 'INVALID_CHOICE')).toBe(true);
    // select single aceita apenas valores válidos
    expect(validateContentData(selectFields, { cor: ['azul'] }).errors.some((e) => e.code === 'SINGLE_ONLY')).toBe(true);
    expect(validateContentData(selectFields, { cor: 'azul' }).valid).toBe(true);

    const radioFields = [base({ type: 'radio', name: 'tamanho', required: true, config: { choices: [{ value: 'p', label: 'P' }] } })];
    expect(validateContentData(radioFields, { tamanho: 'g' }).errors.some((e) => e.code === 'INVALID_CHOICE')).toBe(true);
  });

  it('image/file/gallery validam estrutura e limites', () => {
    const imageFields = [base({ type: 'image', name: 'foto', required: true })];
    expect(validateContentData(imageFields, { foto: 123 }).errors.some((e) => e.code === 'INVALID_MEDIA')).toBe(true);
    expect(validateContentData(imageFields, { foto: { id: 'm1', url: 'https://x/y.png' } }).valid).toBe(true);

    const galleryFields = [
      base({
        type: 'gallery',
        name: 'album',
        required: true,
        config: { minSelections: 2 },
      }),
    ];
    expect(validateContentData(galleryFields, { album: [] }).errors.some((e) => e.code === 'MIN_SELECTIONS')).toBe(true);
  });

  it('google_map valida lat/lng', () => {
    const mapFields = [base({ type: 'google_map', name: 'local', required: true })];

    const bad = validateContentData(mapFields, { local: { address: 'A', lat: 200, lng: 0 } });
    expect(bad.errors.some((e) => e.code === 'INVALID_LATITUDE')).toBe(true);

    const good = validateContentData(mapFields, { local: { address: 'A', lat: -23.5, lng: -46.6 } });
    expect(good.valid).toBe(true);
  });

  it('color_picker valida hex e paleta', () => {
    const colorFields = [
      base({ type: 'color_picker', name: 'tema', required: true, config: { palette: ['#ff0000'] } }),
    ];

    expect(validateContentData(colorFields, { tema: 'vermelho' }).errors.some((e) => e.code === 'INVALID_COLOR')).toBe(true);
    expect(validateContentData(colorFields, { tema: '#00ff00' }).errors.some((e) => e.code === 'NOT_IN_PALETTE')).toBe(true);
    expect(validateContentData(colorFields, { tema: '#FF0000' }).valid).toBe(true);
  });

  it('link exige url e target válido', () => {
    const linkFields = [base({ type: 'link', name: 'cta', required: true })];

    expect(validateContentData(linkFields, { cta: {} }).errors.some((e) => e.code === 'LINK_URL_REQUIRED')).toBe(true);
    expect(
      validateContentData(linkFields, { cta: { url: 'https://x.com', target: '_popup' } }).errors.some((e) => e.code === 'INVALID_TARGET')
    ).toBe(true);
    expect(validateContentData(linkFields, { cta: { url: '/interno', target: '_blank' } }).valid).toBe(true);
  });

  it('repeater valida min/max rows e propaga subcampos obrigatórios', () => {
    const repeaterField = base({
      type: 'repeater',
      name: 'itens',
      required: true,
      config: { minRows: 1, maxRows: 2 },
      subFields: [base({ type: 'text', name: 'nome', label: 'Nome', required: true })],
    });

    const emptyRow = validateContentData([repeaterField], { itens: [{}] });
    expect(emptyRow.errors.some((e) => e.field === 'Nome' && e.code === 'REQUIRED')).toBe(true);

    const tooMany = validateContentData([repeaterField], { itens: [{ nome: 'a' }, { nome: 'b' }, { nome: 'c' }] });
    expect(tooMany.errors.some((e) => e.code === 'MAX_ROWS')).toBe(true);

    const ok = validateContentData([repeaterField], { itens: [{ nome: 'a' }] });
    expect(ok.valid).toBe(true);
  });

  it('flexible_content rejeita layout desconhecido', () => {
    const flexibleField = base({
      type: 'flexible_content',
      name: 'secoes',
      required: true,
      layouts: [{ name: 'hero', subFields: [] }],
    });

    // Formato real persistido: chave `fc_layout` com dados inline.
    const result = validateContentData([flexibleField], {
      secoes: [{ fc_layout: 'hero' }, { fc_layout: 'inexistente' }],
    });

    expect(result.errors.some((e) => e.code === 'UNKNOWN_LAYOUT')).toBe(true);
  });

  it('BUSI-028: campo invisível por lógica condicional isenta validação obrigatória', () => {
    const conditionalRequired = base({
      type: 'email',
      name: 'email_alternativo',
      label: 'Email alternativo',
      required: true,
      conditionalLogic: { groups: [{ rules: [{ field: 'tem_email_alt', operator: 'eq', value: true }] }] },
    });

    const fields = [
      base({ type: 'true_false', name: 'tem_email_alt', label: 'Tem email alt' }),
      conditionalRequired,
    ];

    const hidden = validateContentData(fields, { tem_email_alt: false });
    expect(hidden.valid).toBe(true);

    const visibleAndEmpty = validateContentData(fields, { tem_email_alt: true });
    expect(visibleAndEmpty.valid).toBe(false);
    expect(visibleAndEmpty.errors[0]?.code).toBe('REQUIRED');
  });

  it('layout-only fields não são validados como dados', () => {
    const messageField = base({ type: 'message', name: 'aviso', label: 'Aviso', required: true });
    expect(validateContentData([messageField], {}).valid).toBe(true);
  });
});
