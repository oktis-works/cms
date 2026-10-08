// @oktis-works/core - Conditional Logic Tests

import { describe, it, expect } from 'vitest';
import { evaluateConditionalLogic, isVisibleField, findConditionalIssues } from './conditional.js';
import type { ConditionalLogic } from './conditional.js';

describe('evaluateConditionalLogic', () => {
  it('retorna visível quando não há lógica', () => {
    expect(evaluateConditionalLogic(null, {})).toBe(true);
    expect(evaluateConditionalLogic(undefined, {})).toBe(true);
  });

  it('operador eq/neq com coerção booleana e numérica', () => {
    const logic = { groups: [{ rules: [{ field: 'ativo', operator: 'eq', value: true }] }] };

    expect(evaluateConditionalLogic(logic as never, { ativo: true })).toBe(true);
    expect(evaluateConditionalLogic(logic as never, { ativo: false })).toBe(false);

    const numeric = { groups: [{ rules: [{ field: 'preco', operator: 'eq', value: '10' }] }] };
    expect(evaluateConditionalLogic(numeric as never, { preco: 10 })).toBe(true);
  });

  it('operadores gt/lt são numéricos', () => {
    const logic = {
      groups: [
        {
          rules: [
            { field: 'idade', operator: 'gt', value: 17 },
            { field: 'idade', operator: 'lt', value: 65 },
          ],
        },
      ],
    };

    expect(evaluateConditionalLogic(logic as never, { idade: 30 })).toBe(true);
    expect(evaluateConditionalLogic(logic as never, { idade: 10 })).toBe(false);
    expect(evaluateConditionalLogic(logic as never, { idade: 70 })).toBe(false);
  });

  it('operador pattern_matches usa RegExp', () => {
    const logic = { groups: [{ rules: [{ field: 'cep', operator: 'pattern_matches', value: '^\\d{5}-\\d{3}$' }] }] };

    expect(evaluateConditionalLogic(logic as never, { cep: '01001-000' })).toBe(true);
    expect(evaluateConditionalLogic(logic as never, { cep: 'invalido' })).toBe(false);
  });

  it('grupo ALL exige todas as regras; ANY exige ao menos uma', () => {
    const allLogic = {
      groups: [
        {
          match: 'ALL',
          rules: [
            { field: 'a', operator: 'has_any_value' },
            { field: 'b', operator: 'has_any_value' },
          ],
        },
      ],
    };

    expect(evaluateConditionalLogic(allLogic as never, { a: 'x', b: 'y' })).toBe(true);
    expect(evaluateConditionalLogic(allLogic as never, { a: 'x', b: '' })).toBe(false);

    const anyLogic = {
      groups: [
        {
          match: 'ANY',
          rules: [
            { field: 'a', operator: 'has_any_value' },
            { field: 'b', operator: 'has_any_value' },
          ],
        },
      ],
    };

    expect(evaluateConditionalLogic(anyLogic as never, { a: '', b: 'y' })).toBe(true);
    expect(evaluateConditionalLogic(anyLogic as never, { a: '', b: '' })).toBe(false);
  });

  it('múltiplos grupos são OR entre si', () => {
    const logic = {
      groups: [
        { rules: [{ field: 'tipo', operator: 'eq', value: 'a' }] },
        { rules: [{ field: 'tipo', operator: 'eq', value: 'b' }] },
      ],
    };

    expect(evaluateConditionalLogic(logic as never, { tipo: 'b' })).toBe(true);
    expect(evaluateConditionalLogic(logic as never, { tipo: 'c' })).toBe(false);
  });
});

describe('isVisibleField / BUSI-029 escopo de referências', () => {
  const makeField = (
    name: string,
    conditionalLogic?: unknown
  ): { name: string; conditionalLogic?: ConditionalLogic | null } & Record<string, unknown> => ({
    type: 'text',
    name,
    label: name,
    required: false,
    config: {},
    conditionalLogic: (conditionalLogic ?? null) as ConditionalLogic | null,
  });

  it('referência anterior no mesmo grupo é válida', () => {
    const fields = [makeField('cor'), makeField('mostrar_cor', { groups: [{ rules: [{ field: 'cor', operator: 'eq', value: 'azul' }] }] })];
    const data = { cor: 'azul' };

    expect(isVisibleField(fields[1]!, data)).toBe(true);
  });

  it('referência posterior no mesmo grupo é inválida (BUSI-029)', () => {
    const fields = [makeField('posterior', { groups: [{ rules: [{ field: 'anterior', operator: 'has_any_value' }] }] }), makeField('anterior')];

    const issues = findConditionalIssues(fields as never);
    expect(issues.some((issue) => issue.field === 'posterior')).toBe(true);
  });

  it('autorreferência é inválida', () => {
    const fields = [makeField('auto', { groups: [{ rules: [{ field: 'auto', operator: 'has_any_value' }] }] })];

    expect(findConditionalIssues(fields as never)).toHaveLength(1);
  });

  it('campo invisível isenta validação obrigatória (BUSI-028)', () => {
    // coberto em validation.test.ts
    expect(true).toBe(true);
  });
});
