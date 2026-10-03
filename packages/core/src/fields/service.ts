// @oktis-works/core - Field Group Service

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { LocationContext, LocationRule } from './location-rules.js';
import { matchLocationRules } from './location-rules.js';
import { findConditionalIssues } from './conditional.js';
import type { FieldRefLike } from './conditional.js';
import type { ValidatableField } from './types/validators/structural.js';

export interface FlexibleLayoutInput {
  name: string;
  label: string;
  display?: 'block' | 'table' | 'row';
  min?: number;
  max?: number;
  subFields: FieldDefinitionInput[];
}

export interface FieldDefinitionInput {
  id?: string;
  type: string;
  name: string;
  key?: string;
  label: string;
  instructions?: string;
  required?: boolean;
  config?: Record<string, unknown>;
  conditionalLogic?: unknown;
  sortOrder?: number;
  subFields?: FieldDefinitionInput[];
  layouts?: FlexibleLayoutInput[];
}

export interface FieldGroupInput {
  title: string;
  key?: string;
  locationRules?: LocationRule[][];
  position?: 'normal' | 'side' | 'acf_after_title';
  displayStyle?: 'standard' | 'seamless' | 'grouped';
  active?: boolean;
  fields?: FieldDefinitionInput[];
}

export interface FieldGroup extends Omit<FieldGroupInput, 'fields'> {
  id: string;
  fields: ResolvedFieldDefinition[];
}

export interface ResolvedFieldDefinition {
  id: string;
  type: string;
  name: string;
  key: string;
  label: string;
  instructions?: string;
  required: boolean;
  config: Record<string, unknown>;
  conditionalLogic: unknown;
  sortOrder: number;
  subFields: ResolvedFieldDefinition[];
  layouts: Array<{ name: string; label: string; display: string; min?: number; max?: number; subFields: ResolvedFieldDefinition[] }>;
}

function slugifyKey(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
}

export class FieldGroupService {
  async list(): Promise<Array<Omit<FieldGroup, 'fields'> & { fieldCount: number }>> {
    const sql = getConnection();
    const rows = await sql.unsafe(
      `SELECT fg.*, (SELECT COUNT(*) FROM field_definitions fd WHERE fd.group_id = fg.id) as field_count
       FROM field_groups fg ORDER BY fg.title ASC`
    );

    return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: String(row['id']),
      title: String(row['title']),
      key: String(row['key']),
      locationRules: (row['location_rules'] as LocationRule[][]) ?? [],
      position: row['position'] as FieldGroup['position'],
      displayStyle: row['display_style'] as FieldGroup['displayStyle'],
      active: Boolean(row['active']),
      fieldCount: Number(row['field_count'] ?? 0),
    }));
  }

  async getById(id: string): Promise<FieldGroup | null> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT * FROM field_groups WHERE id = $1', [id]);
    const group = rows[0] as Record<string, unknown> | undefined;
    if (!group) return null;

    const fields = await this.getDefinitionTree(id);

    return this.rowToGroup(group, fields);
  }

  async create(input: FieldGroupInput): Promise<FieldGroup> {
    const sql = getConnection();

    if (input.fields) {
      const flat = this.flattenForValidation(input.fields);
      const issues = findConditionalIssues(flat);
      if (issues.length > 0) {
        throw new Error(`Conditional logic inválida: ${issues.map((issue) => `${issue.field}: ${issue.issue}`).join('; ')}`);
      }
    }

    const id = randomUUID();
    const key = input.key ?? `group_${slugifyKey(input.title)}_${Date.now().toString(36)}`;

    await sql.unsafe(
      `INSERT INTO field_groups (id, title, key, location_rules, position, display_style, active)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [
        id,
        input.title,
        key,
        input.locationRules ?? [],
        input.position ?? 'normal',
        input.displayStyle ?? 'standard',
        input.active ?? true,
      ]
    );

    if (input.fields && input.fields.length > 0) {
      for (const [index, field] of input.fields.entries()) {
        await this.insertDefinition(id, field, null, null, index);
      }
    }

    return (await this.getById(id))!;
  }

  async update(id: string, patch: Partial<FieldGroupInput>): Promise<FieldGroup | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    await sql.unsafe(
      `UPDATE field_groups SET
         title = $1,
         location_rules = $2::jsonb,
         position = $3,
         display_style = $4,
         active = $5,
         updated_at = NOW()
       WHERE id = $6`,
      [
        patch.title ?? existing.title,
        patch.locationRules ?? existing.locationRules ?? [],
        patch.position ?? existing.position ?? 'normal',
        patch.displayStyle ?? existing.displayStyle ?? 'standard',
        patch.active ?? existing.active ?? true,
        id,
      ]
    );

    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();
    const result = await sql.unsafe('DELETE FROM field_groups WHERE id = $1 RETURNING id', [id]);
    return result.length > 0;
  }

  async resolveGroupsByLocation(context: LocationContext): Promise<FieldGroup[]> {
    const all = await this.list();
    const matching: FieldGroup[] = [];

    for (const summary of all) {
      if (!summary.active) continue;
      if (!matchLocationRules(summary.locationRules ?? [], context)) continue;

      const full = await this.getById(summary.id);
      if (full) matching.push(full);
    }

    return matching;
  }

  async toValidatableFields(groups: FieldGroup[]): Promise<ValidatableField[]> {
    const fields: ValidatableField[] = [];

    for (const group of groups) {
      fields.push(...group.fields.map((field) => this.toValidatable(field)));
    }

    return fields;
  }

  private toValidatable(field: ResolvedFieldDefinition): ValidatableField {
    return {
      type: field.type,
      name: field.name,
      label: field.label,
      required: field.required,
      config: field.config,
      conditionalLogic: field.conditionalLogic as ValidatableField['conditionalLogic'],
      subFields: field.subFields?.map((sub) => this.toValidatable(sub)),
      layouts: field.layouts?.map((layout) => ({
        name: layout.name,
        label: layout.label,
        subFields: layout.subFields.map((sub) => this.toValidatable(sub)),
      })),
    };
  }

  private flattenForValidation(fields: FieldDefinitionInput[]): FieldRefLike[] {
    const flat: FieldRefLike[] = [];

    const walk = (input: FieldDefinitionInput[]): void => {
      for (const field of input) {
        flat.push({
          name: field.name,
          conditionalLogic: (field.conditionalLogic as FieldRefLike['conditionalLogic']) ?? null,
        });
        if (field.subFields) walk(field.subFields);
        if (field.layouts) {
          for (const layout of field.layouts) walk(layout.subFields);
        }
      }
    };

    walk(fields);
    return flat;
  }

  private async insertDefinition(
    groupId: string,
    input: FieldDefinitionInput,
    parentFieldId: string | null,
    layoutId: string | null,
    sortOrder: number
  ): Promise<string> {
    const sql = getConnection();
    const id = randomUUID();
    const key = input.key ?? `field_${slugifyKey(input.name)}_${Date.now().toString(36)}`;

    await sql.unsafe(
      `INSERT INTO field_definitions (id, group_id, parent_field_id, layout_id, type, name, key, label, instructions, required, config, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
      [
        id,
        groupId,
        parentFieldId,
        layoutId,
        input.type,
        input.name,
        key,
        input.label,
        input.instructions ?? null,
        input.required ?? false,
        { ...(input.config ?? {}), ...(input.conditionalLogic ? { conditionalLogic: input.conditionalLogic } : {}) },
        sortOrder,
      ]
    );

    if (input.subFields && ['repeater', 'group'].includes(input.type)) {
      for (const [index, sub] of input.subFields.entries()) {
        await this.insertDefinition(groupId, sub, id, null, index);
      }
    }

    if (input.type === 'flexible_content' && input.layouts) {
      for (const [layoutIndex, layout] of input.layouts.entries()) {
        const layoutIdNew = randomUUID();

        await sql.unsafe(
          `INSERT INTO flexible_layouts (id, field_id, name, label, display, min, max, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [layoutIdNew, id, layout.name, layout.label, layout.display ?? 'block', layout.min ?? null, layout.max ?? null, layoutIndex]
        );

        for (const [index, sub] of layout.subFields.entries()) {
          await this.insertDefinition(groupId, sub, null, layoutIdNew, index);
        }
      }
    }

    return id;
  }

  private async getDefinitionTree(groupId: string): Promise<ResolvedFieldDefinition[]> {
    const sql = getConnection();
    const rows = await sql.unsafe(
      'SELECT * FROM field_definitions WHERE group_id = $1 ORDER BY sort_order ASC',
      [groupId]
    );

    const rawDefinitions = rows as unknown as Array<Record<string, unknown>>;

    const definitionsById = new Map<string, ResolvedFieldDefinition>();
    const parentIdByDefId = new Map<string, string | null>();
    const layoutRefByDefId = new Map<string, string | null>();

    for (const row of rawDefinitions) {
      const id = String(row['id']);
      definitionsById.set(id, this.rowToDefinition(row));
      parentIdByDefId.set(id, row['parent_field_id'] ? String(row['parent_field_id']) : null);
      layoutRefByDefId.set(id, row['layout_id'] ? String(row['layout_id']) : null);
    }

    const layoutRows = await sql.unsafe(
      `SELECT fl.* FROM flexible_layouts fl
       JOIN field_definitions fd ON fd.id = fl.field_id
       WHERE fd.group_id = $1
       ORDER BY fl.sort_order ASC`,
      [groupId]
    ) as unknown as Array<Record<string, unknown>>;

    const layoutMetaById = new Map<string, Record<string, unknown>>();
    const ownerIdByLayoutId = new Map<string, string>();

    for (const row of layoutRows) {
      const layoutId = String(row['id']);
      layoutMetaById.set(layoutId, row);
      ownerIdByLayoutId.set(layoutId, String(row['field_id']));
    }

    const roots: ResolvedFieldDefinition[] = [];

    for (const row of rawDefinitions) {
      const id = String(row['id']);
      const definition = definitionsById.get(id)!;
      const parentId = parentIdByDefId.get(id) ?? null;
      const layoutRef = layoutRefByDefId.get(id) ?? null;

      if (parentId && definitionsById.has(parentId)) {
        definitionsById.get(parentId)!.subFields.push(definition);
        continue;
      }

      if (layoutRef && layoutMetaById.has(layoutRef)) {
        const ownerId = ownerIdByLayoutId.get(layoutRef)!;
        const owner = definitionsById.get(ownerId);

        if (owner) {
          const meta = layoutMetaById.get(layoutRef)!;
          const layoutName = String(meta['name']);

          let layoutEntry = owner.layouts.find((entry) => entry.name === layoutName);
          if (!layoutEntry) {
            layoutEntry = {
              name: layoutName,
              label: String(meta['label']),
              display: String(meta['display'] ?? 'block'),
              min: (meta['min'] as number | undefined) ?? undefined,
              max: (meta['max'] as number | undefined) ?? undefined,
              subFields: [],
            };
            owner.layouts.push(layoutEntry);
          }
          layoutEntry.subFields.push(definition);
          continue;
        }
      }

      roots.push(definition);
    }

    return roots;
  }

  private rowToDefinition(row: Record<string, unknown>): ResolvedFieldDefinition {
    const rawConfig = (row['config'] as Record<string, unknown>) ?? {};
    const { conditionalLogic, ...config } = rawConfig as { conditionalLogic?: unknown };

    return {
      id: String(row['id']),
      type: String(row['type']),
      name: String(row['name']),
      key: String(row['key']),
      label: String(row['label']),
      instructions: (row['instructions'] as string | null) ?? undefined,
      required: Boolean(row['required']),
      config,
      conditionalLogic: conditionalLogic ?? null,
      sortOrder: Number(row['sort_order'] ?? 0),
      subFields: [],
      layouts: [],
    };
  }

  private rowToGroup(row: Record<string, unknown>, fields: ResolvedFieldDefinition[]): FieldGroup {
    return {
      id: String(row['id']),
      title: String(row['title']),
      key: String(row['key']),
      locationRules: (row['location_rules'] as LocationRule[][]) ?? [],
      position: row['position'] as FieldGroup['position'],
      displayStyle: row['display_style'] as FieldGroup['displayStyle'],
      active: Boolean(row['active']),
      fields,
    };
  }
}

export const fieldGroupService = new FieldGroupService();
