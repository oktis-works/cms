/**
 * Content Validator
 * Validates migrated content against content_types schema
 */

import { WPMySQLConnector } from '../connectors/mysql';
import {
  WPMigrationConfig,
  MigrationPhase,
  PhaseStats,
  IDMaps,
  MigrationError,
} from '../types';

export interface ContentValidatorDeps {
  connector: WPMySQLConnector;
  config: WPMigrationConfig;
  idMaps: IDMaps;
  stats: Record<MigrationPhase, PhaseStats>;
  errors: MigrationError[];
  tenantId: string;
}

export class ContentValidator {
  private deps: ContentValidatorDeps;
  private contentTypeSchemas: Map<string, Record<string, unknown>> = new Map();

  constructor(deps: ContentValidatorDeps) {
    this.deps = deps;
  }

  /**
   * Load all content type schemas
   */
  async loadSchemas(): Promise<void> {
    const { connector } = this.deps;
    const rows = await connector.query<{ slug: string; schema: string }>(
      `SELECT slug, schema FROM content_types`
    );

    for (const row of rows) {
      try {
        this.contentTypeSchemas.set(row['slug'], JSON.parse(row['schema']));
      } catch {
        // Invalid schema, skip
      }
    }
  }

  /**
   * Validate all migrated content
   */
  async validate(): Promise<{ valid: number; invalid: number; errors: string[] }> {
    const { connector, tenantId, errors } = this.deps;

    await this.loadSchemas();

    const content = await connector.query<{ id: string; type: string; body: string; data: string; metadata: string }>(
      `SELECT id, type, body, data, metadata FROM content WHERE tenant_id = ?`,
      [tenantId]
    );

    let valid = 0;
    let invalid = 0;
    const validationErrors: string[] = [];

    for (const c of content) {
      const schema = this.contentTypeSchemas.get(c['type']);
      if (!schema) {
        valid++; // No schema to validate against
        continue;
      }

      try {
        this.validateAgainstSchema(c['id'], c['type'], schema, {
          body: JSON.parse(c['body']),
          data: JSON.parse(c['data']),
          metadata: JSON.parse(c['metadata']),
        });
        valid++;
      } catch (error) {
        invalid++;
        const msg = `Content ${c['id']} (${c['type']}) validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        validationErrors.push(msg);
        errors.push({
          phase: 'validation' as MigrationPhase,
          wpTable: 'content',
          wpId: c['id'],
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
   * Validate content against JSON schema
   */
  private validateAgainstSchema(
    contentId: string,
    contentType: string,
    schema: Record<string, unknown>,
    data: { body: unknown; data: unknown; metadata: unknown }
  ): void {
    // Simple validation - check required fields
    const required = schema['required'];
    if (required && Array.isArray(required)) {
      const allData = { ...(data.body as Record<string, unknown>), ...(data.data as Record<string, unknown>), ...(data.metadata as Record<string, unknown>) };
      for (const field of required) {
        if (!(field in allData) && !(field in (data.body as Record<string, unknown>))) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }

    // Could add full JSON Schema validation here using a library like ajv
    // For now, basic structure validation
  }
}

/**
 * Factory function
 */
export async function validateContent(
  connector: WPMySQLConnector,
  config: WPMigrationConfig,
  idMaps: IDMaps,
  stats: Record<MigrationPhase, PhaseStats>,
  errors: MigrationError[],
  tenantId: string
): Promise<{ valid: number; invalid: number; errors: string[] }> {
  const validator = new ContentValidator({ connector, config, idMaps, stats, errors, tenantId });
  return validator.validate();
}