// @oktis-works/validation - Client-side Field Validation (inline, profissional para 100% drift)
// Reestruturado inline para eliminar 4 imports relativos flagrados como frontend→backend
// Mantém paridade ACF, mas sem dependências externas para cliente (manutenível, isolado)

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function checkRequired(value: unknown, required: boolean | undefined, field: string, errors: FieldError[]): boolean {
  if (!required) return true;
  if (isEmptyValue(value)) {
    errors.push({ field, code: 'REQUIRED', message: `${field} é obrigatório` });
    return false;
  }
  return true;
}

function validateTextLike(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  const str = String(value);
  const minLength = (config['minLength'] ?? config['minimum']) as number | undefined;
  const characterLimit = (config['characterLimit'] ?? config['maxLength']) as number | undefined;
  if (minLength !== undefined && str.length < minLength) {
    errors.push({ field, code: 'MIN_LENGTH', message: `${field} deve ter pelo menos ${minLength} caracteres` });
  }
  if (characterLimit !== undefined && str.length > characterLimit) {
    errors.push({ field, code: 'CHARACTER_LIMIT', message: `${field} excede o limite de ${characterLimit} caracteres` });
  }
}

function validateEmail(value: unknown, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(String(value))) {
    errors.push({ field, code: 'INVALID_EMAIL', message: `${field} não é um e-mail válido` });
  }
}

function validateUrl(value: unknown, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  try {
    const parsed = new URL(String(value));
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
  } catch {
    errors.push({ field, code: 'INVALID_URL', message: `${field} não é uma URL válida (http/https)` });
  }
}

function validateNumber(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  const num = Number(value);
  if (Number.isNaN(num)) {
    errors.push({ field, code: 'NOT_A_NUMBER', message: `${field} deve ser um número` });
    return;
  }
  const minValue = (config['minValue'] ?? config['min']) as number | undefined;
  const maxValue = (config['maxValue'] ?? config['max']) as number | undefined;
  const step = config['step'] as number | undefined;
  if (minValue !== undefined && num < minValue) errors.push({ field, code: 'MIN_VALUE', message: `${field} deve ser maior ou igual a ${minValue}` });
  if (maxValue !== undefined && num > maxValue) errors.push({ field, code: 'MAX_VALUE', message: `${field} deve ser menor ou igual a ${maxValue}` });
  if (step !== undefined && step > 0) {
    const base = minValue ?? 0;
    const remainder = Math.abs((num - base) / step - Math.round((num - base) / step));
    if (remainder > 1e-9) errors.push({ field, code: 'STEP_MISMATCH', message: `${field} deve seguir o incremento de ${step}` });
  }
}

interface FieldChoice { value: string; label: string; }
function getValidChoiceValues(config: Record<string, unknown>): Set<string> {
  const choices = (config['choices'] as FieldChoice[] | undefined) ?? [];
  return new Set(choices.map((c) => String(c.value)));
}
function checkClosedSet(value: unknown, valid: Set<string>, allowCustom: boolean, field: string, errors: FieldError[]): void {
  if (allowCustom) return;
  if (!valid.has(String(value))) errors.push({ field, code: 'INVALID_CHOICE', message: `${field} contém um valor fora das opções permitidas` });
}
function checkSelectionCount(values: unknown[], config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  const min = config['minSelections'] as number | undefined;
  const max = config['maxSelections'] as number | undefined;
  if (min !== undefined && values.length < min) errors.push({ field, code: 'MIN_SELECTIONS', message: `${field} requer no mínimo ${min} seleção(ões)` });
  if (max !== undefined && values.length > max) errors.push({ field, code: 'MAX_SELECTIONS', message: `${field} permite no máximo ${max} seleção(ões)` });
}
function validateSelect(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  const multiple = Boolean(config['multiple']);
  const allowCustom = Boolean(config['allowCustom'] ?? false);
  const valid = getValidChoiceValues(config);
  if (multiple) {
    if (!Array.isArray(value)) { errors.push({ field, code: 'NOT_ARRAY', message: `${field} deve ser uma lista` }); return; }
    if (!allowCustom) for (const item of value) checkClosedSet(item, valid, false, field, errors);
    checkSelectionCount(value, config, field, errors); return;
  }
  checkClosedSet(value, valid, allowCustom, field, errors);
  if (Array.isArray(value)) errors.push({ field, code: 'SINGLE_ONLY', message: `${field} aceita apenas um valor` });
}
function validateCheckbox(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  if (!Array.isArray(value)) { errors.push({ field, code: 'NOT_ARRAY', message: `${field} deve ser uma lista de valores` }); return; }
  const valid = getValidChoiceValues(config);
  for (const item of value) checkClosedSet(item, valid, true, field, errors);
  checkSelectionCount(value, config, field, errors);
}
function validateRadio(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  checkClosedSet(value, getValidChoiceValues(config), Boolean(config['allowCustom']), field, errors);
}
function validateTrueFalse(value: unknown, field: string, errors: FieldError[]): void {
  if (value === null || value === undefined) return;
  const isBoolean = typeof value === 'boolean' || value === 0 || value === 1 || value === '0' || value === '1';
  if (!isBoolean) errors.push({ field, code: 'NOT_BOOLEAN', message: `${field} deve ser verdadeiro ou falso` });
}

interface MediaValue { id?: string; url?: string; mimeType?: string; size?: number; width?: number; height?: number; }
function validateMediaItem(item: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    errors.push({ field, code: 'INVALID_MEDIA', message: `${field} deve referenciar uma mídia válida` }); return;
  }
  const media = item as MediaValue;
  const mimeTypes = (config['mimeTypes'] as string[] | undefined) ?? [];
  if (mimeTypes.length > 0 && media.mimeType) {
    const normalized = mimeTypes.map((m) => m.toLowerCase());
    if (!normalized.includes(media.mimeType.toLowerCase())) errors.push({ field, code: 'INVALID_MIME', message: `${field} não aceita arquivos do tipo ${media.mimeType}` });
  }
  const maxSize = config['maxSize'] as number | undefined;
  const minSize = config['minSize'] as number | undefined;
  if (media.size !== undefined) {
    if (maxSize !== undefined && media.size > maxSize) errors.push({ field, code: 'FILE_TOO_LARGE', message: `${field} excede o tamanho máximo de ${Math.round(maxSize / 1024)}KB` });
    if (minSize !== undefined && media.size < minSize) errors.push({ field, code: 'FILE_TOO_SMALL', message: `${field} está abaixo do tamanho mínimo de ${Math.round(minSize / 1024)}KB` });
  }
  if (media.width !== undefined && media.height !== undefined) {
    const minWidth = config['minWidth'] as number | undefined;
    const maxWidth = config['maxWidth'] as number | undefined;
    const minHeight = config['minHeight'] as number | undefined;
    const maxHeight = config['maxHeight'] as number | undefined;
    if (minWidth !== undefined && media.width < minWidth) errors.push({ field, code: 'MIN_WIDTH', message: `${field} requer largura mínima de ${minWidth}px` });
    if (maxWidth !== undefined && media.width > maxWidth) errors.push({ field, code: 'MAX_WIDTH', message: `${field} permite largura máxima de ${maxWidth}px` });
    if (minHeight !== undefined && media.height < minHeight) errors.push({ field, code: 'MIN_HEIGHT', message: `${field} requer altura mínima de ${minHeight}px` });
    if (maxHeight !== undefined && media.height > maxHeight) errors.push({ field, code: 'MAX_HEIGHT', message: `${field} permite altura máxima de ${maxHeight}px` });
  }
}
function validateImage(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return; validateMediaItem(value, config, field, errors);
}
function validateFile(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return; validateMediaItem(value, config, field, errors);
}
function validateGallery(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (value === null || value === undefined) return;
  if (!Array.isArray(value)) { errors.push({ field, code: 'NOT_ARRAY', message: `${field} deve ser uma lista de imagens` }); return; }
  const hasLimits = config['minSelections'] !== undefined || config['maxSelections'] !== undefined;
  if (value.length === 0 && !hasLimits) return;
  const minSelections = config['minSelections'] as number | undefined;
  const maxSelections = config['maxSelections'] as number | undefined;
  if (minSelections !== undefined && value.length < minSelections) errors.push({ field, code: 'MIN_SELECTIONS', message: `${field} requer no mínimo ${minSelections} imagem(ns)` });
  if (maxSelections !== undefined && value.length > maxSelections) errors.push({ field, code: 'MAX_SELECTIONS', message: `${field} permite no máximo ${maxSelections} imagem(ns)` });
  for (const item of value) validateMediaItem(item, config, field, errors);
}

function validateRelationshipIds(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  const multiple = config['multiple'] !== false;
  const minSelections = config['minSelections'] as number | undefined;
  const maxSelections = config['maxSelections'] as number | undefined;
  const ids = Array.isArray(value) ? value : [value];
  for (const id of ids) if (typeof id !== 'string' && typeof id !== 'number') { errors.push({ field, code: 'INVALID_ID', message: `${field} contém um identificador inválido` }); return; }
  if (multiple) {
    if (maxSelections !== undefined && ids.length > maxSelections) errors.push({ field, code: 'MAX_SELECTIONS', message: `${field} permite no máximo ${maxSelections} seleção(ões)` });
    if (minSelections !== undefined && ids.length < minSelections) errors.push({ field, code: 'MIN_SELECTIONS', message: `${field} requer no mínimo ${minSelections} seleção(ões)` });
  } else if (ids.length > 1) errors.push({ field, code: 'SINGLE_ONLY', message: `${field} aceita apenas um valor` });
}
function validateLink(value: unknown, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  if (typeof value !== 'object' || value === null) { errors.push({ field, code: 'INVALID_LINK', message: `${field} deve ser um objeto de link` }); return; }
  const link = value as { url?: unknown; target?: unknown };
  if (!link.url || typeof link.url !== 'string') { errors.push({ field, code: 'LINK_URL_REQUIRED', message: `${field} requer uma URL` }); return; }
  try {
    const parsed = new URL(link.url);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) && !link.url.startsWith('#') && !link.url.startsWith('/')) throw new Error('protocol');
  } catch {
    if (!link.url.startsWith('#') && !link.url.startsWith('/') && !link.url.startsWith('?')) errors.push({ field, code: 'INVALID_URL', message: `${field} contém uma URL inválida` });
  }
  if (link.target !== undefined && !['_self', '_blank'].includes(String(link.target))) errors.push({ field, code: 'INVALID_TARGET', message: `${field} aceita apenas _self ou _blank` });
}
function validateGoogleMap(value: unknown, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  if (typeof value !== 'object' || value === null) { errors.push({ field, code: 'INVALID_MAP', message: `${field} deve conter endereço e coordenadas` }); return; }
  const map = value as { address?: unknown; lat?: unknown; lng?: unknown };
  if (isEmptyValue(map.address)) errors.push({ field, code: 'ADDRESS_REQUIRED', message: `${field} requer um endereço` });
  const lat = Number(map.lat); const lng = Number(map.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push({ field, code: 'INVALID_LATITUDE', message: `${field} contém latitude inválida (-90 a 90)` });
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push({ field, code: 'INVALID_LONGITUDE', message: `${field} contém longitude inválida (-180 a 180)` });
}
const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function validateColorPicker(value: unknown, config: Record<string, unknown>, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;
  const color = String(value);
  const isRgba = color.startsWith('rgba(');
  if (isRgba && !config['enableOpacity']) { errors.push({ field, code: 'OPACITY_DISABLED', message: `${field} não permite transparência` }); return; }
  if (!isRgba && !HEX_PATTERN.test(color)) { errors.push({ field, code: 'INVALID_COLOR', message: `${field} deve ser uma cor em formato hexadecimal válido` }); return; }
  const palette = (config['palette'] as string[] | undefined) ?? [];
  if (palette.length > 0) {
    const normalizedPalette = palette.map((e) => e.toLowerCase());
    if (!normalizedPalette.includes(color.toLowerCase())) errors.push({ field, code: 'NOT_IN_PALETTE', message: `${field} deve usar uma cor da paleta definida` });
  }
}

/**
 * Valida um único campo no cliente e retorna a primeira mensagem de erro
 * ou null quando válido. Não considera lógica condicional.
 */
export function validateFieldClient(
  field: {
    type: string;
    label: string;
    required?: boolean;
    config?: Record<string, unknown>;
    subFields?: unknown[];
  },
  value: unknown
): string | null {
  if (field.type === 'clone' || field.type === 'repeater' || field.type === 'group' || field.type === 'flexible_content') return null;
  const config = field.config ?? {};
  const errors: FieldError[] = [];
  checkRequired(value, field.required, field.label, errors);
  switch (field.type) {
    case 'text': case 'textarea': case 'password': validateTextLike(value, config, field.label, errors); break;
    case 'email': validateEmail(value, field.label, errors); break;
    case 'url': case 'oembed': validateUrl(value, field.label, errors); break;
    case 'number': case 'range': validateNumber(value, config, field.label, errors); break;
    case 'wysiwyg': validateTextLike(value, config, field.label, errors); break;
    case 'select': validateSelect(value, config, field.label, errors); break;
    case 'checkbox': validateCheckbox(value, config, field.label, errors); break;
    case 'radio': validateRadio(value, config, field.label, errors); break;
    case 'true_false': validateTrueFalse(value, field.label, errors); break;
    case 'image': validateImage(value, config, field.label, errors); break;
    case 'file': validateFile(value, config, field.label, errors); break;
    case 'gallery': validateGallery(value, config, field.label, errors); break;
    case 'link': validateLink(value, field.label, errors); break;
    case 'page_link': case 'post_object': case 'relationship': case 'taxonomy': case 'user': validateRelationshipIds(value, config, field.label, errors); break;
    case 'google_map': validateGoogleMap(value, field.label, errors); break;
    case 'color_picker': validateColorPicker(value, config, field.label, errors); break;
    default: break;
  }
  return errors[0]?.message ?? null;
}
