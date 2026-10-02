// @oktis-works/core - Relational & Content Field Validators (ACF parity)

import type { FieldError } from './basic.js';
import { isEmptyValue } from './basic.js';

export function validateRelationshipIds(
  value: unknown,
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  if (isEmptyValue(value)) return;

  const multiple = config['multiple'] !== false;
  const minSelections = config['minSelections'] as number | undefined;
  const maxSelections = config['maxSelections'] as number | undefined;

  const ids = Array.isArray(value) ? value : [value];

  for (const id of ids) {
    if (typeof id !== 'string' && typeof id !== 'number') {
      errors.push({ field, code: 'INVALID_ID', message: `${field} contém um identificador inválido` });
      return;
    }
  }

  if (multiple) {
    if (maxSelections !== undefined && ids.length > maxSelections) {
      errors.push({
        field,
        code: 'MAX_SELECTIONS',
        message: `${field} permite no máximo ${maxSelections} seleção(ões)`,
      });
    }
    if (minSelections !== undefined && ids.length < minSelections) {
      errors.push({
        field,
        code: 'MIN_SELECTIONS',
        message: `${field} requer no mínimo ${minSelections} seleção(ões)`,
      });
    }
  } else if (ids.length > 1) {
    errors.push({ field, code: 'SINGLE_ONLY', message: `${field} aceita apenas um valor` });
  }
}

export function validateLink(value: unknown, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;

  if (typeof value !== 'object' || value === null) {
    errors.push({ field, code: 'INVALID_LINK', message: `${field} deve ser um objeto de link` });
    return;
  }

  const link = value as { url?: unknown; target?: unknown };

  if (!link.url || typeof link.url !== 'string') {
    errors.push({ field, code: 'LINK_URL_REQUIRED', message: `${field} requer uma URL` });
    return;
  }

  try {
    const parsed = new URL(link.url);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) && !link.url.startsWith('#') && !link.url.startsWith('/')) {
      throw new Error('protocol');
    }
  } catch {
    if (!link.url.startsWith('#') && !link.url.startsWith('/') && !link.url.startsWith('?')) {
      errors.push({ field, code: 'INVALID_URL', message: `${field} contém uma URL inválida` });
    }
  }

  if (link.target !== undefined && !['_self', '_blank'].includes(String(link.target))) {
    errors.push({ field, code: 'INVALID_TARGET', message: `${field} aceita apenas _self ou _blank` });
  }
}

export function validateGoogleMap(value: unknown, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;

  if (typeof value !== 'object' || value === null) {
    errors.push({ field, code: 'INVALID_MAP', message: `${field} deve conter endereço e coordenadas` });
    return;
  }

  const map = value as { address?: unknown; lat?: unknown; lng?: unknown };

  if (isEmptyValue(map.address)) {
    errors.push({ field, code: 'ADDRESS_REQUIRED', message: `${field} requer um endereço` });
  }

  const lat = Number(map.lat);
  const lng = Number(map.lng);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.push({ field, code: 'INVALID_LATITUDE', message: `${field} contém latitude inválida (-90 a 90)` });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.push({ field, code: 'INVALID_LONGITUDE', message: `${field} contém longitude inválida (-180 a 180)` });
  }
}

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function validateColorPicker(
  value: unknown,
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  if (isEmptyValue(value)) return;

  const color = String(value);

  const isRgba = color.startsWith('rgba(');
  if (isRgba && !config['enableOpacity']) {
    errors.push({
      field,
      code: 'OPACITY_DISABLED',
      message: `${field} não permite transparência`,
    });
    return;
  }

  if (!isRgba && !HEX_PATTERN.test(color)) {
    errors.push({ field, code: 'INVALID_COLOR', message: `${field} deve ser uma cor em formato hexadecimal válido` });
    return;
  }

  const palette = (config['palette'] as string[] | undefined) ?? [];
  if (palette.length > 0) {
    const normalizedPalette = palette.map((entry) => entry.toLowerCase());
    if (!normalizedPalette.includes(color.toLowerCase())) {
      errors.push({
        field,
        code: 'NOT_IN_PALETTE',
        message: `${field} deve usar uma cor da paleta definida`,
      });
    }
  }
}
