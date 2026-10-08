// @oktis-works/core - Media Field Validators

import type { FieldError } from './basic.js';
import { isEmptyValue } from './basic.js';

export interface MediaValue {
  id?: string;
  url?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
}

function validateMediaItem(item: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    errors.push({
      field,
      code: 'INVALID_MEDIA',
      message: `${field} deve referenciar uma mídia válida`,
    });
    return;
  }

  const media = item as MediaValue;

  const mimeTypes = (config['mimeTypes'] as string[] | undefined) ?? [];
  if (mimeTypes.length > 0 && media.mimeType) {
    const normalized = mimeTypes.map((mime) => mime.toLowerCase());
    if (!normalized.includes(media.mimeType.toLowerCase())) {
      errors.push({
        field,
        code: 'INVALID_MIME',
        message: `${field} não aceita arquivos do tipo ${media.mimeType}`,
      });
    }
  }

  const maxSize = config['maxSize'] as number | undefined;
  const minSize = config['minSize'] as number | undefined;

  if (media.size !== undefined) {
    if (maxSize !== undefined && media.size > maxSize) {
      errors.push({
        field,
        code: 'FILE_TOO_LARGE',
        message: `${field} excede o tamanho máximo de ${Math.round(maxSize / 1024)}KB`,
      });
    }
    if (minSize !== undefined && media.size < minSize) {
      errors.push({
        field,
        code: 'FILE_TOO_SMALL',
        message: `${field} está abaixo do tamanho mínimo de ${Math.round(minSize / 1024)}KB`,
      });
    }
  }

  if (media.width !== undefined && media.height !== undefined) {
    const minWidth = config['minWidth'] as number | undefined;
    const maxWidth = config['maxWidth'] as number | undefined;
    const minHeight = config['minHeight'] as number | undefined;
    const maxHeight = config['maxHeight'] as number | undefined;

    if (minWidth !== undefined && media.width < minWidth) {
      errors.push({ field, code: 'MIN_WIDTH', message: `${field} requer largura mínima de ${minWidth}px` });
    }
    if (maxWidth !== undefined && media.width > maxWidth) {
      errors.push({ field, code: 'MAX_WIDTH', message: `${field} permite largura máxima de ${maxWidth}px` });
    }
    if (minHeight !== undefined && media.height < minHeight) {
      errors.push({ field, code: 'MIN_HEIGHT', message: `${field} requer altura mínima de ${minHeight}px` });
    }
    if (maxHeight !== undefined && media.height > maxHeight) {
      errors.push({ field, code: 'MAX_HEIGHT', message: `${field} permite altura máxima de ${maxHeight}px` });
    }
  }
}

export function validateImage(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  validateMediaItem(value, config, field, errors);
}

export function validateFile(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  validateMediaItem(value, config, field, errors);
}

export function validateGallery(
  value: unknown,
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  if (value === null || value === undefined) return;

  if (!Array.isArray(value)) {
    errors.push({ field, code: 'NOT_ARRAY', message: `${field} deve ser uma lista de imagens` });
    return;
  }

  // Array vazio ainda passa pelos limites configurados (minSelections/maxSelections).
  const hasLimits =
    config['minSelections'] !== undefined || config['maxSelections'] !== undefined;
  if (value.length === 0 && !hasLimits) return;

  const minSelections = config['minSelections'] as number | undefined;
  const maxSelections = config['maxSelections'] as number | undefined;

  if (minSelections !== undefined && value.length < minSelections) {
    errors.push({
      field,
      code: 'MIN_SELECTIONS',
      message: `${field} requer no mínimo ${minSelections} imagem(ns)`,
    });
  }
  if (maxSelections !== undefined && value.length > maxSelections) {
    errors.push({
      field,
      code: 'MAX_SELECTIONS',
      message: `${field} permite no máximo ${maxSelections} imagem(ns)`,
    });
  }

  for (const item of value) {
    validateMediaItem(item, config, field, errors);
  }
}
