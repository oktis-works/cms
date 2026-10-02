// @oktis-works/core - Conditional Logic Engine (ACF parity)

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'pattern_matches'
  | 'contains'
  | 'has_any_value'
  | 'has_no_value';

export interface ConditionalRule {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface ConditionalGroup {
  match: 'ALL' | 'ANY';
  rules: ConditionalRule[];
}

export interface ConditionalLogic {
  match: 'ALL' | 'ANY';
  groups: ConditionalGroup[];
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const truthyA = a === true || a === 'true' || a === 1 || a === '1';
    const truthyB = b === true || b === 'true' || b === 1 || b === '1';
    return truthyA === truthyB;
  }
  const numA = toNumber(a);
  const numB = toNumber(b);
  if (numA !== null && numB !== null) return numA === numB;
  return String(a) === String(b);
}

export function evaluateRule(rule: ConditionalRule, values: Record<string, unknown>): boolean {
  const fieldValue = values[rule.field];

  switch (rule.operator) {
    case 'eq':
      return looseEquals(fieldValue, rule.value);
    case 'neq':
      return !looseEquals(fieldValue, rule.value);
    case 'gt': {
      const a = toNumber(fieldValue);
      const b = toNumber(rule.value);
      return a !== null && b !== null && a > b;
    }
    case 'lt': {
      const a = toNumber(fieldValue);
      const b = toNumber(rule.value);
      return a !== null && b !== null && a < b;
    }
    case 'pattern_matches':
      try {
        return new RegExp(String(rule.value)).test(String(fieldValue ?? ''));
      } catch {
        return false;
      }
    case 'contains': {
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((item) => looseEquals(item, rule.value));
      }
      return String(fieldValue ?? '').includes(String(rule.value));
    }
    case 'has_any_value':
      return !isEmpty(fieldValue);
    case 'has_no_value':
      return isEmpty(fieldValue);
    default:
      return false;
  }
}

export function evaluateGroup(group: ConditionalGroup, values: Record<string, unknown>): boolean {
  if (!group.rules || group.rules.length === 0) return true;

  const results = group.rules.map((rule) => evaluateRule(rule, values));
  return group.match === 'ANY' ? results.some(Boolean) : results.every(Boolean);
}

export function evaluateConditionalLogic(
  logic: ConditionalLogic | null | undefined,
  values: Record<string, unknown>
): boolean {
  if (!logic || !logic.groups || logic.groups.length === 0) return true;

  const results = logic.groups.map((group) => evaluateGroup(group, values));
  // ACF parity: grupos são combinados com OR; dentro do grupo vale group.match (default ALL).
  return (logic.match ?? 'ANY') === 'ANY' ? results.some(Boolean) : results.every(Boolean);
}

export function isVisibleField<T extends { name: string; conditionalLogic?: ConditionalLogic | null }>(
  field: T,
  siblingValues: Record<string, unknown>
): boolean {
  if (!field.conditionalLogic) return true;
  return evaluateConditionalLogic(field.conditionalLogic, siblingValues);
}

export interface FieldRefLike {
  name: string;
  conditionalLogic?: ConditionalLogic | null;
}

export function findConditionalIssues(fields: Array<FieldRefLike>): Array<{ field: string; issue: string }> {
  const issues: Array<{ field: string; issue: string }> = [];
  const declaredIndex = new Map<string, number>();

  fields.forEach((field, index) => {
    declaredIndex.set(field.name, index);

    if (!field.conditionalLogic?.groups) return;

    for (const group of field.conditionalLogic.groups) {
      for (const rule of group.rules ?? []) {
        const targetIndex = declaredIndex.get(rule.field);

        if (targetIndex === undefined) {
          issues.push({
            field: field.name,
            issue: `Campo condicionante "${rule.field}" não existe no mesmo grupo`,
          });
        } else if (targetIndex >= index) {
          issues.push({
            field: field.name,
            issue:
              targetIndex === index
                ? 'Auto-referência não permitida'
                : `Só é possível referenciar campos declarados antes de "${field.name}"`,
          });
        }
      }
    }
  });

  return issues;
}
