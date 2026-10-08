// @oktis-works/core - Choice Field Validators

import type { FieldError } from './basic.js';
import { isEmptyValue } from './basic.js';

export interface FieldChoice {
  value: string;
  label: string;
}

export function getValidChoiceValues(config: Record<string, unknown>): Set<string> {
  const choices = (config['choices'] as FieldChoice[] | undefined) ?? [];
  return new Set(choices.map((choice) => String(choice.value)));
}

function checkClosedSet(
  value: unknown,
  valid: Set<string>,
  allowCustom: boolean,
  field: string,
  errors: FieldError[]
): void {
  if (allowCustom) return;
  if (!valid.has(String(value))) {
    errors.push({
      field,
      code: 'INVALID_CHOICE',
      message: `${field} contém um valor fora das opções permitidas`,
    });
  }
}

function checkSelectionCount(
  values: unknown[],
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  const min = config['minSelections'] as number | undefined;
  const max = config['maxSelections'] as number | undefined;

  if (min !== undefined && values.length < min) {
    errors.push({
      field,
      code: 'MIN_SELECTIONS',
      message: `${field} requer no mínimo ${min} seleção(ões)`,
    });
  }
  if (max !== undefined && values.length > max) {
    errors.push({
      field,
      code: 'MAX_SELECTIONS',
      message: `${field} permite no máximo ${max} seleção(ões)`,
    });
  }
}

export function validateSelect(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;

  const multiple = Boolean(config['multiple']);
  const allowCustom = Boolean(config['allowCustom'] ?? false);
  const valid = getValidChoiceValues(config);

  if (multiple) {
    if (!Array.isArray(value)) {
      errors.push({ field, code: 'NOT_ARRAY', message: `${field} deve ser uma lista` });
      return;
    }

    if (!allowCustom) {
      for (const item of value) checkClosedSet(item, valid, false, field, errors);
    }

    checkSelectionCount(value, config, field, errors);
    return;
  }

  checkClosedSet(value, valid, allowCustom, field, errors);

  if (Array.isArray(value)) {
    errors.push({ field, code: 'SINGLE_ONLY', message: `${field} aceita apenas um valor` });
  }
}

export function validateCheckbox(
  value: unknown,
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  if (isEmptyValue(value)) return;

  if (!Array.isArray(value)) {
    errors.push({ field, code: 'NOT_ARRAY', message: `${field} deve ser uma lista de valores` });
    return;
  }

  const valid = getValidChoiceValues(config);
  for (const item of value) checkClosedSet(item, valid, true, field, errors);

  checkSelectionCount(value, config, field, errors);
}

export function validateRadio(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  checkClosedSet(value, getValidChoiceValues(config), Boolean(config['allowCustom']), field, errors);
}

export function validateTrueFalse(value: unknown, field: string, errors: FieldError[]): void {
  if (value === null || value === undefined) return;

  const isBoolean =
    typeof value === 'boolean' || value === 0 || value === 1 || value === '0' || value === '1';

  if (!isBoolean) {
    errors.push({ field, code: 'NOT_BOOLEAN', message: `${field} deve ser verdadeiro ou falso` });
  }
}
