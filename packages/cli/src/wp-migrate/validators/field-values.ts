/**
 * Field Values Validator
 * Validates field_values against field_definitions.config (JSON Schema)
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
} from '../types';

export interface FieldValuesValidatorDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  tenantId: string;
}

export class FieldValuesValidator {
  private deps: FieldValuesValidatorDeps;
  private fieldDefinitions: Map<string, { config: Record<string, unknown>; required: boolean }> = new Map();

  constructor(deps: FieldValuesValidatorDeps) {
    this.deps = deps;
  }

  /**
   * Load all field definitions with their JSON Schema config
   */
  async loadFieldDefinitions(): Promise<void> {
    const { connector, tenantId } = this.deps;

    const rows = await connector.query<{ id: string; config: string; required: number }>(`
      SELECT id, config, required FROM field_definitions
      WHERE id IN (
        SELECT DISTINCT field_definition_id FROM field_values
        WHERE entity_type = 'content' AND entity_id IN (
          SELECT id FROM content WHERE tenant_id = ?
        )
      )
    `, [tenantId]);

    for (const row of rows) {
      try {
        this.fieldDefinitions.set(row['id'], {
          config: JSON.parse(row['config']),
          required: row['required'] === 1,
        });
      } catch {
        // Invalid config
      }
    }
  }

  /**
   * Validate all field values
   */
  async validate(): Promise<{ valid: number; invalid: number; errors: string[] }> {
    const { connector, tenantId, errors } = this.deps;

    await this.loadFieldDefinitions();

    const fieldValues = await connector.query<{ id: string; field_definition_id: string; value: string }>(`
      SELECT fv.id, fv.field_definition_id, fv.value
      FROM field_values fv
      JOIN content c ON fv.entity_id = c.id
      WHERE fv.entity_type = 'content' AND c.tenant_id = ?
    `, [tenantId]);

    let valid = 0;
    let invalid = 0;
    const validationErrors: string[] = [];

    for (const fv of fieldValues) {
      const def = this.fieldDefinitions.get(fv['field_definition_id']);
      if (!def) {
        valid++; // No definition to validate against
        continue;
      }

      try {
        this.validateFieldValue(fv['id'], def, JSON.parse(fv['value']));
        valid++;
      } catch (error) {
        invalid++;
        const msg = `Field value ${fv['id']} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        validationErrors.push(msg);
        errors.push({
          phase: 'validation' as MigrationPhase,
          wpTable: 'field_values',
          wpId: fv['id'],
          field: 'schema',
          message: msg,
          severity: 'error',
          timestamp: new Date().toISOString(),
        });
      }
    }

    return { valid, invalid, errors: validationErrors };
  }

  /**
   * Validate a single field value against its JSON Schema
   */
  private validateFieldValue(
    fieldValueId: string,
    definition: { config: Record<string, unknown>; required: boolean },
    value: unknown
  ): void {
    const schema = definition.config;

    // Check required
    if (definition.required && (value === null || value === undefined || value === '')) {
      throw new Error('Required field is empty');
    }

    // Type validation based on schema.type
    const schemaType = schema['type'];
    if (schemaType) {
      const expectedType = schemaType as string;
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType !== actualType && !(expectedType === 'number' && actualType === 'number')) {
        throw new Error(`Type mismatch: expected ${expectedType}, got ${actualType}`);
      }
    }

    // String validations
    if (schemaType === 'string' && typeof value === 'string') {
      const minLength = schema['minLength'];
      if (minLength && value.length < (minLength as number)) {
        throw new Error(`String too short: minimum ${minLength} characters`);
      }
      const maxLength = schema['maxLength'];
      if (maxLength && value.length > (maxLength as number)) {
        throw new Error(`String too long: maximum ${maxLength} characters`);
      }
      const pattern = schema['pattern'];
      if (pattern && !(new RegExp(pattern as string)).test(value)) {
        throw new Error(`String does not match pattern: ${pattern}`);
      }
      const format = schema['format'];
      if (format === 'email' && !value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new Error('Invalid email format');
      }
      if (format === 'url' && !value.match(/^https?:\/\//)) {
        throw new Error('Invalid URL format');
      }
    }

    // Number validations
    if ((schemaType === 'number' || schemaType === 'integer') && typeof value === 'number') {
      const minimum = schema['minimum'];
      if (minimum !== undefined && value < (minimum as number)) {
        throw new Error(`Value below minimum: ${minimum}`);
      }
      const maximum = schema['maximum'];
      if (maximum !== undefined && value > (maximum as number)) {
        throw new Error(`Value above maximum: ${maximum}`);
      }
    }

    // Enum validation
    const enumValues = schema['enum'];
    if (enumValues && Array.isArray(enumValues) && !enumValues.includes(value)) {
      throw new Error(`Value not in allowed enum: ${JSON.stringify(enumValues)}`);
    }

    // Array validation
    if (schemaType === 'array' && Array.isArray(value)) {
      const minItems = schema['minItems'];
      if (minItems && value.length < (minItems as number)) {
        throw new Error(`Array too short: minimum ${minItems} items`);
      }
      const maxItems = schema['maxItems'];
      if (maxItems && value.length > (maxItems as number)) {
        throw new Error(`Array too long: maximum ${maxItems} items`);
      }
      const items = schema['items'];
      if (items) {
        for (const item of value) {
          this.validateFieldValue(fieldValueId, { config: items as Record<string, unknown>, required: false }, item);
        }
      }
    }

    // Object validation
    const objSchemaType = schema['type'];
    if (objSchemaType === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const required = schema['required'];
      if (required && Array.isArray(required)) {
        for (const req of required) {
          if (!(req in obj)) {
            throw new Error(`Missing required property: ${req}`);
          }
        }
      }
      const properties = schema['properties'];
      if (properties) {
        for (const [prop, propSchema] of Object.entries(properties as Record<string, unknown>)) {
          if (prop in obj) {
            this.validateFieldValue(fieldValueId, { config: propSchema as Record<string, unknown>, required: false }, obj[prop]);
          }
        }
      }
    }
  }
}

/**
 * Factory function
 */
export async function validateFieldValues(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  tenantId: string
): Promise<{ valid: number; invalid: number; errors: string[] }> {
  const validator = new FieldValuesValidator({ connector, config, idMaps, stats, errors, tenantId });
  return validator.validate();
}