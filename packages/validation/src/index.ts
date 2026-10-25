// @oktis-works/validation - Pure field validation, sem dependência de banco.
// Pacote UI-safe: pode ser importado por frontend (admin/themes) e backend (core/api).

export * from './basic.js';
export * from './choice.js';
export * from './media.js';
export * from './relational.js';
export * from './structural.js';
export {
  checkExtensionCompatibility,
  assertCompatible,
  CMS_VERSION,
} from './compatibility.js';
export type { CompatibilityIssue, CompatibilityManifest } from './compatibility.js';
export { validateFieldClient } from './client-validate.js';
export { evaluateConditionalLogic, findConditionalIssues, isVisibleField } from './conditional.js';
export type {
  ConditionalLogic,
  ConditionalRule,
  ConditionalGroup,
  ConditionOperator,
} from './conditional.js';
export { expandCloneFields } from './clone.js';
export type { CloneDisplay } from './clone.js';
export {
  CANONICAL_CORE_FIELDS,
  CANONICAL_FIELD_ALIASES,
  canonicalFieldName,
  logicalValuesToBody,
  logicalValuesToNative,
  normalizeLogicalValues,
} from './field-values.js';
export { findFieldPathIssues } from './field-paths.js';
export type { FieldPathDefinition } from './field-paths.js';
export type {
  CanonicalCoreField,
  LogicalValueRecord,
  LogicalValueSources,
} from './field-values.js';
export {
  PLUGIN_PERMISSIONS,
  PLUGIN_PERMISSION_DEFAULT,
  isKnownPluginPermission,
  unknownPluginPermissions,
  resolvePluginPermissionPolicy,
} from './plugin-permissions.js';
export type { PluginPermission, PermissionPolicy } from './plugin-permissions.js';
