// @oktis-works/core - Field Validation Engine (ACF parity)

import { isVisibleField, type ConditionalLogic } from './conditional.js';
import { expandCloneFields } from './clone.js';
import {
  checkRequired,
  validateEmail,
  validateNumber,
  validateTextLike,
  validateUrl,
  type FieldError,
} from './types/validators/basic.js';
import {
  validateCheckbox,
  validateRadio,
  validateSelect,
  validateTrueFalse,
} from './types/validators/choice.js';
import { validateFile, validateGallery, validateImage } from './types/validators/media.js';
import {
  validateColorPicker,
  validateGoogleMap,
  validateLink,
  validateRelationshipIds,
} from './types/validators/relational.js';
import {
  validateFlexible,
  validateRepeater,
  type ValidatableField,
} from './types/validators/structural.js';

export interface FieldValidationContext {
  locale?: string;
}

function isLayoutOnly(type: string): boolean {
  return ['message', 'tab', 'accordion'].includes(type);
}

export function validateFieldValue(
  field: ValidatableField,
  value: unknown,
  siblingValues: Record<string, unknown>,
  errors: FieldError[],
  context?: FieldValidationContext
): void {
  if (!isVisibleField(field, siblingValues)) return;
  if (isLayoutOnly(field.type)) return;

  const config = field.config ?? {};

  const requiredOk = checkRequired(value, field.required, field.label, errors);

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'password':
      validateTextLike(value, config, field.label, errors);
      break;
    case 'email':
      validateTextLike(value, config, field.label, errors);
      validateEmail(value, field.label, errors);
      break;
    case 'url':
    case 'oembed':
      validateUrl(value, field.label, errors);
      break;
    case 'number':
    case 'range':
      validateNumber(value, config, field.label, errors);
      break;
    case 'wysiwyg':
      validateTextLike(value, config, field.label, errors);
      break;
    case 'select':
      validateSelect(value, config, field.label, errors);
      break;
    case 'checkbox':
      validateCheckbox(value, config, field.label, errors);
      break;
    case 'radio':
      validateRadio(value, config, field.label, errors);
      break;
    case 'true_false':
      validateTrueFalse(value, field.label, errors);
      break;
    case 'image':
      validateImage(value, config, field.label, errors);
      break;
    case 'file':
      validateFile(value, config, field.label, errors);
      break;
    case 'gallery':
      validateGallery(value, config, field.label, errors);
      break;
    case 'link':
      validateLink(value, field.label, errors);
      break;
    case 'page_link':
    case 'post_object':
    case 'relationship':
    case 'taxonomy':
    case 'user':
      validateRelationshipIds(value, config, field.label, errors);
      break;
    case 'google_map':
      validateGoogleMap(value, field.label, errors);
      break;
    case 'color_picker':
      validateColorPicker(value, config, field.label, errors);
      break;
    default:
      break;
  }

  if (field.type === 'repeater') {
    validateRepeater(value, config, field.label, errors);

    if (Array.isArray(value) && Array.isArray(field.subFields)) {
      for (const row of value) {
        if (typeof row !== 'object' || row === null) continue;
        validateFields(field.subFields, row as Record<string, unknown>, errors, context);
      }
    }
  }

  if (field.type === 'group') {
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && Array.isArray(field.subFields)) {
      validateFields(field.subFields, value as Record<string, unknown>, errors, context);
    }
  }

  if (field.type === 'flexible_content') {
    validateFlexible(value, field.layouts, config, field.label, errors);

    if (Array.isArray(value) && Array.isArray(field.layouts)) {
      for (const row of value) {
        const flexibleRow = row as { layout?: string; data?: Record<string, unknown> };
        if (!flexibleRow || typeof flexibleRow.layout !== 'string' || typeof flexibleRow.data !== 'object') continue;

        const layout = field.layouts.find((entry) => entry.name === flexibleRow.layout);
        if (layout && Array.isArray(layout.subFields)) {
          validateFields(layout.subFields, flexibleRow.data ?? {}, errors, context);
        }
      }
    }
  }

  void requiredOk;
}

export function validateFields(
  rawFields: ValidatableField[],
  data: Record<string, unknown>,
  errors: FieldError[],
  context?: FieldValidationContext
): void {
  // Clones são expandidos antes da validação (ACF parity: seamless/group).
  const fields = expandCloneFields(rawFields);

  for (const field of fields) {
    validateFieldValue(field, data[field.name], data, errors, context);
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldError[];
}

export function validateContentData(
  fields: ValidatableField[],
  data: Record<string, unknown>,
  context?: FieldValidationContext
): ValidationResult {
  const errors: FieldError[] = [];
  validateFields(fields, data, errors, context);
  return { valid: errors.length === 0, errors };
}

export type { FieldError };
export type { ConditionalLogic };
