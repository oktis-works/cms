// @oktis-works/core - Basic Field Validators (ACF parity)

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function checkRequired(
  value: unknown,
  required: boolean | undefined,
  field: string,
  errors: FieldError[]
): boolean {
  if (!required) return true;

  if (isEmptyValue(value)) {
    errors.push({
      field,
      code: 'REQUIRED',
      message: `${field} é obrigatório`,
    });
    return false;
  }

  return true;
}

export function validateTextLike(
  value: unknown,
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  if (isEmptyValue(value)) return;

  const str = String(value);
  const minLength = (config['minLength'] ?? config['minimum']) as number | undefined;
  const characterLimit = (config['characterLimit'] ?? config['maxLength']) as number | undefined;

  if (minLength !== undefined && str.length < minLength) {
    errors.push({
      field,
      code: 'MIN_LENGTH',
      message: `${field} deve ter pelo menos ${minLength} caracteres`,
    });
  }

  if (characterLimit !== undefined && str.length > characterLimit) {
    errors.push({
      field,
      code: 'CHARACTER_LIMIT',
      message: `${field} excede o limite de ${characterLimit} caracteres`,
    });
  }
}

export function validateEmail(value: unknown, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(String(value))) {
    errors.push({
      field,
      code: 'INVALID_EMAIL',
      message: `${field} não é um e-mail válido`,
    });
  }
}

export function validateUrl(value: unknown, field: string, errors: FieldError[]): void {
  if (isEmptyValue(value)) return;

  try {
    const parsed = new URL(String(value));
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
  } catch {
    errors.push({
      field,
      code: 'INVALID_URL',
      message: `${field} não é uma URL válida (http/https)`,
    });
  }
}

export function validateNumber(
  value: unknown,
  config: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): void {
  if (isEmptyValue(value)) return;

  const num = Number(value);
  if (Number.isNaN(num)) {
    errors.push({ field, code: 'NOT_A_NUMBER', message: `${field} deve ser um número` });
    return;
  }

  const minValue = (config['minValue'] ?? config['min']) as number | undefined;
  const maxValue = (config['maxValue'] ?? config['max']) as number | undefined;
  const step = config['step'] as number | undefined;

  if (minValue !== undefined && num < minValue) {
    errors.push({ field, code: 'MIN_VALUE', message: `${field} deve ser maior ou igual a ${minValue}` });
  }
  if (maxValue !== undefined && num > maxValue) {
    errors.push({ field, code: 'MAX_VALUE', message: `${field} deve ser menor ou igual a ${maxValue}` });
  }
  if (step !== undefined && step > 0) {
    const base = minValue ?? 0;
    const remainder = Math.abs((num - base) / step - Math.round((num - base) / step));
    if (remainder > 1e-9) {
      errors.push({
        field,
        code: 'STEP_MISMATCH',
        message: `${field} deve seguir o incremento de ${step}`,
      });
    }
  }
}
