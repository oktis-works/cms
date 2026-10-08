// @oktis-works/core - Structural Field Validators

import type { FieldError } from './basic.js';
import { isEmptyValue } from './basic.js';
import type { ConditionalLogic } from './conditional.js';

export interface ValidatableField {
  type: string;
  name: string;
  label: string;
  required?: boolean;
  config?: Record<string, unknown>;
  conditionalLogic?: ConditionalLogic | null;
  subFields?: ValidatableField[];
  layouts?: Array<{ name: string; label: string; subFields: ValidatableField[] }>;
}

export interface FlexibleRow {
  /** Chave real persistida (content.body / field_values). */
  fc_layout?: string;
  /** Formato legado (imports/tests antigos). */
  layout?: string;
  /** Dados aninhados apenas no formato legado. */
  data?: Record<string, unknown>;
}

function checkRowsCount(
  rows: unknown[],
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  const minRows = config['minRows'] as number | undefined;
  const maxRows = config['maxRows'] as number | undefined;

  if (minRows !== undefined && rows.length < minRows) {
    errors.push({ field, code: 'MIN_ROWS', message: `${field} requer no mínimo ${minRows} linha(s)` });
  }
  if (maxRows !== undefined && rows.length > maxRows) {
    errors.push({ field, code: 'MAX_ROWS', message: `${field} permite no máximo ${maxRows} linha(s)` });
  }
}

export function validateRepeater(
  value: unknown,
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  if (isEmptyValue(value)) return;

  if (!Array.isArray(value)) {
    errors.push({ field, code: 'NOT_ARRAY', message: `${field} deve ser uma lista de linhas` });
    return;
  }

  checkRowsCount(value, config, field, errors);
}

export function validateFlexible(
  value: unknown,
  layouts: Array<{ name: string; subFields: ValidatableField[] }> | undefined,
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  if (isEmptyValue(value)) return;

  if (!Array.isArray(value)) {
    errors.push({ field, code: 'NOT_ARRAY', message: `${field} deve ser uma lista de seções` });
    return;
  }

  checkRowsCount(value, config, field, errors);

  const knownLayouts = new Set((layouts ?? []).map((layout) => layout.name));

  for (const row of value) {
    const flexibleRow = row as Partial<FlexibleRow>;

    if (!flexibleRow || typeof flexibleRow !== 'object') {
      errors.push({
        field,
        code: 'INVALID_LAYOUT_ROW',
        message: `${field} contém uma seção sem layout definido`,
      });
      continue;
    }

    // Chave real: `fc_layout` (dados inline); `layout` é o formato legado.
    const layoutName =
      typeof flexibleRow.fc_layout === 'string'
        ? flexibleRow.fc_layout
        : typeof flexibleRow.layout === 'string'
          ? flexibleRow.layout
          : null;

    if (layoutName === null) {
      errors.push({
        field,
        code: 'INVALID_LAYOUT_ROW',
        message: `${field} contém uma seção sem layout definido`,
      });
      continue;
    }

    if (knownLayouts.size > 0 && !knownLayouts.has(layoutName)) {
      errors.push({
        field,
        code: 'UNKNOWN_LAYOUT',
        message: `${field} referencia o layout desconhecido "${layoutName}"`,
      });
    }
  }
}
