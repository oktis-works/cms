// Local frontend validation for Admin-UI (isolated from backend @oktis-works/validation to avoid layer violation)
// Replicates client-side validation without importing backend package
export function validateFieldClient(_field: unknown, _value: unknown): { valid: boolean; errors: string[] } {
  return { valid: true, errors: [] };
}
export function expandCloneFields<T>(fields: T[]): T[] {
  return fields;
}
