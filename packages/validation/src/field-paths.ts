// @oktis-works/validation - Logical field path checks

export interface FieldPathDefinition {
  name: string;
  type?: string;
  config?: Record<string, unknown>;
  subFields?: FieldPathDefinition[];
  layouts?: Array<{ name: string; subFields: FieldPathDefinition[] }>;
}

/** Finds duplicate or invalid value paths before a field tree is persisted. */
export function findFieldPathIssues(fields: FieldPathDefinition[], scope = 'root'): string[] {
  const issues: string[] = [];
  const names = new Set<string>();

  for (const field of fields) {
    if (!field.name || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(field.name)) {
      issues.push(`Invalid field name "${field.name}" in ${scope}`);
    }
    if (names.has(field.name)) issues.push(`Duplicate field name "${field.name}" in ${scope}`);
    names.add(field.name);

    if (field.subFields) issues.push(...findFieldPathIssues(field.subFields, `${scope}.${field.name}`));
    for (const layout of field.layouts ?? []) {
      issues.push(...findFieldPathIssues(layout.subFields, `${scope}.${field.name}.${layout.name}`));
    }
    if (field.type === 'clone') {
      const targets = field.config?.['clone'];
      if (!Array.isArray(targets) || targets.some((target) => typeof target !== 'string')) {
        issues.push(`Clone field "${field.name}" must reference field names`);
      }
    }
  }

  return issues;
}
