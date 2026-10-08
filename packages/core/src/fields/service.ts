// @oktis-works/core - Field Group Service

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { LocationContext, LocationRule } from './location-rules.js';
import { matchLocationRules } from './location-rules.js';
import { findConditionalIssues } from './conditional.js';
import type { FieldRefLike } from './conditional.js';
import type { ValidatableField } from './types/validators/structural.js';
import { validateContentData } from './validation.js';

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
  position?: 'normal' | 'side' | 'after_title';
  displayStyle?: 'standard' | 'seamless' | 'grouped';
  active?: boolean;
  metadata?: Record<string, unknown>;
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
  isCoreField: boolean;
  isLocked: boolean;
  coreFieldKey?: string;
}

const REQUIRED_CORE_FIELDS = new Set(['title', 'slug']);
const DEFAULT_CORE_FIELDS = [
  'title',
  'slug',
  'content',
  'excerpt',
  'featured_image',
  'seo_title',
  'seo_description',
  'status',
  'author',
];

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
      metadata: (row['metadata'] as Record<string, unknown>) ?? {},
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

  async getByKey(key: string): Promise<FieldGroup | null> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT * FROM field_groups WHERE key = $1', [key]);
    const group = rows[0] as Record<string, unknown> | undefined;
    if (!group) return null;

    const fields = await this.getDefinitionTree(String(group['id']));

    return this.rowToGroup(group, fields);
  }

  async create(input: FieldGroupInput): Promise<FieldGroup> {
    const sql = getConnection();

    this.validateFields(input.fields);

    const id = randomUUID();
    const key = input.key ?? `group_${slugifyKey(input.title)}_${Date.now().toString(36)}`;

    await sql.unsafe(
      `INSERT INTO field_groups (id, title, key, location_rules, position, display_style, active, metadata)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb)`,
      [
        id,
        input.title,
        key,
        input.locationRules ?? [],
        input.position ?? 'normal',
        input.displayStyle ?? 'standard',
        input.active ?? true,
        input.metadata ?? {},
      ]
    );

    if (input.fields && input.fields.length > 0) {
      // Sync com preservação de ids (novos campos não têm id — todos inseridos).
      await this.syncDefinitions(id, input.fields);
    }

    return (await this.getById(id))!;
  }

  async update(id: string, patch: Partial<FieldGroupInput>): Promise<FieldGroup | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    this.validateFields(patch.fields);

    await sql.unsafe(
      `UPDATE field_groups SET
         title = $1,
         location_rules = $2::jsonb,
         position = $3,
         display_style = $4,
         active = $5,
         metadata = $6::jsonb,
         updated_at = NOW()
       WHERE id = $7`,
      [
        patch.title ?? existing.title,
        patch.locationRules ?? existing.locationRules ?? [],
        patch.position ?? existing.position ?? 'normal',
        patch.displayStyle ?? existing.displayStyle ?? 'standard',
        patch.active ?? existing.active ?? true,
        patch.metadata ?? existing.metadata ?? {},
        id,
      ]
    );

    if (patch.fields !== undefined) {
      // Sync diff: preserva ids de campos que continuam existindo (e os
      // field_values/lógicas condicionais vinculados), insere os novos,
      // atualiza os existentes e remove os ausentes. Antes era DELETE+reinsert,
      // o que regenerava ids e perdia os vínculos.
      await this.syncDefinitions(id, patch.fields);
    }

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
    const enabledCoreFields = context.contentType
      ? await this.getEnabledCoreFields(context.contentType)
      : null;

    for (const summary of all) {
      if (!summary.active) continue;
      if (!matchLocationRules(summary.locationRules ?? [], context)) continue;

      const full = await this.getById(summary.id);
      if (full) matching.push(enabledCoreFields ? this.filterCoreFields(full, enabledCoreFields) : full);
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

  /**
   * Valida os valores de campos customizados contra as definições ativas para
   * o contexto (usado pelo content service no create/update). Retorna as
   * mensagens de erro (vazio = válido). Delega ao motor `validateContentData`,
   * que já trata visibilidade condicional, tipos layout-only, required,
   * repeaters, layouts, grupos e expansão de clone. Campos core (title/slug/…)
   * são removidos antes: seus valores vivem em colunas próprias, não no body.
   */
  async validateValues(context: LocationContext, values: Record<string, unknown>): Promise<string[]> {
    const groups = await this.resolveGroupsByLocation(context);
    const fields = groups.flatMap((group) => this.stripCoreFields(group.fields));

    const { errors } = validateContentData(
      fields.map((field) => this.toValidatable(field)),
      values
    );

    return errors.map((error) => error.message);
  }

  /** Remove campos core (recursivamente) — não são valores do body. */
  private stripCoreFields(fields: ResolvedFieldDefinition[]): ResolvedFieldDefinition[] {
    return fields
      .filter((field) => !field.isCoreField)
      .map((field) => ({
        ...field,
        subFields: this.stripCoreFields(field.subFields),
        layouts: field.layouts.map((layout) => ({
          ...layout,
          subFields: this.stripCoreFields(layout.subFields),
        })),
      }));
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

  private validateFields(fields?: FieldDefinitionInput[]): void {
    if (!fields) return;

    const flat = this.flattenForValidation(fields);
    const issues = findConditionalIssues(flat);
    if (issues.length > 0) {
      throw new Error(`Conditional logic inválida: ${issues.map((issue) => `${issue.field}: ${issue.issue}`).join('; ')}`);
    }
  }

  private async getEnabledCoreFields(contentType: string): Promise<Set<string>> {
    const sql = getConnection();
    const rows = await sql.unsafe('SELECT default_fields FROM content_types WHERE slug = $1', [contentType]);
    const raw = rows[0]?.['default_fields'];
    const configured = Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === 'string')
      : DEFAULT_CORE_FIELDS;

    // Título e slug são sempre obrigatórios no editor e não podem ser desativados.
    return new Set([...configured, ...REQUIRED_CORE_FIELDS]);
  }

  private filterCoreFields(group: FieldGroup, enabledCoreFields: Set<string>): FieldGroup {
    const fields = group.fields.filter(
      (field) => !field.isCoreField || !field.coreFieldKey || enabledCoreFields.has(field.coreFieldKey)
    );

    return { ...group, fields };
  }

  /**
   * Sincroniza a árvore de `field_definitions` do grupo com o payload.
   *
   * - Campos persistidos que continuam no payload são ATUALIZADOS no lugar
   *   (id preservado → field_values e referências de lógica condicional
   *   continuam válidos);
   * - Campos novos são inseridos; os ausentes são removidos (cascade limpa
   *   filhos e values);
   * - Sub-campos são persistidos para QUALQUER tipo que os envie (group,
   *   repeater, tipos de plugin) — antes só `repeater|group` eram aceitos e
   *   o resto era descartado em silêncio;
   * - Layouts de `flexible_content` são casados por nome (update/insert/remoção).
   */
  private async syncDefinitions(groupId: string, inputs: FieldDefinitionInput[]): Promise<void> {
    const sql = getConnection();

    const existingRows = (await sql.unsafe('SELECT id FROM field_definitions WHERE group_id = $1', [
      groupId,
    ])) as unknown as Array<Record<string, unknown>>;

    const existingIds = new Set(existingRows.map((row) => String(row['id'])));
    const keptIds = new Set<string>();

    const walk = async (
      list: FieldDefinitionInput[],
      parentFieldId: string | null,
      layoutId: string | null
    ): Promise<void> => {
      for (const [index, input] of list.entries()) {
        const claimedId = input.id ? String(input.id) : null;
        // Ids só são reutilizados se pertencerem a este grupo e ainda não
        // tiverem sido consumidos (protege contra payload duplicado).
        const reusableId =
          claimedId && existingIds.has(claimedId) && !keptIds.has(claimedId) ? claimedId : null;

        const configValue = {
          ...(input.config ?? {}),
          ...(input.conditionalLogic ? { conditionalLogic: input.conditionalLogic } : {}),
        };

        let currentId: string;

        if (reusableId) {
          await sql.unsafe(
            `UPDATE field_definitions SET
               type = $1, name = $2, label = $3, instructions = $4, required = $5,
               config = $6::jsonb, sort_order = $7, parent_field_id = $8, layout_id = $9,
               updated_at = NOW()
             WHERE id = $10 AND group_id = $11`,
            [
              input.type,
              input.name,
              input.label,
              input.instructions ?? null,
              input.required ?? false,
              configValue,
              index,
              parentFieldId,
              layoutId,
              reusableId,
              groupId,
            ]
          );
          currentId = reusableId;
        } else {
          currentId = await this.insertRow(groupId, input, parentFieldId, layoutId, index);
        }

        keptIds.add(currentId);

        if (input.subFields && input.subFields.length > 0) {
          await walk(input.subFields, currentId, null);
        }

        if (input.type === 'flexible_content' && input.layouts && input.layouts.length > 0) {
          const layoutRows = (await sql.unsafe(
            'SELECT id, name FROM flexible_layouts WHERE field_id = $1',
            [currentId]
          )) as unknown as Array<Record<string, unknown>>;

          const layoutIdByName = new Map(
            layoutRows.map((row) => [String(row['name']), String(row['id'])])
          );
          const keptLayoutIds = new Set<string>();

          for (const [layoutIndex, layout] of input.layouts.entries()) {
            const existingLayoutId = layoutIdByName.get(layout.name) ?? null;
            let currentLayoutId: string;

            if (existingLayoutId) {
              await sql.unsafe(
                `UPDATE flexible_layouts
                    SET label = $1, display = $2, min = $3, max = $4, sort_order = $5
                  WHERE id = $6 AND field_id = $7`,
                [
                  layout.label,
                  layout.display ?? 'block',
                  layout.min ?? null,
                  layout.max ?? null,
                  layoutIndex,
                  existingLayoutId,
                  currentId,
                ]
              );
              currentLayoutId = existingLayoutId;
            } else {
              currentLayoutId = randomUUID();
              await sql.unsafe(
                `INSERT INTO flexible_layouts (id, field_id, name, label, display, min, max, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  currentLayoutId,
                  currentId,
                  layout.name,
                  layout.label,
                  layout.display ?? 'block',
                  layout.min ?? null,
                  layout.max ?? null,
                  layoutIndex,
                ]
              );
            }

            keptLayoutIds.add(currentLayoutId);
            await walk(layout.subFields, null, currentLayoutId);
          }

          const staleLayoutIds = layoutRows
            .map((row) => String(row['id']))
            .filter((id) => !keptLayoutIds.has(id));
          if (staleLayoutIds.length > 0) {
            await sql.unsafe('DELETE FROM flexible_layouts WHERE id = ANY($1::uuid[])', [
              staleLayoutIds,
            ]);
          }
        }
      }
    };

    await walk(inputs, null, null);

    // Remoções por último: todos os updates/inserts já re-apontaram filhos
    // mantidos, então o cascade só atinge linhas realmente removidas.
    const staleIds = existingRows
      .map((row) => String(row['id']))
      .filter((id) => !keptIds.has(id));
    if (staleIds.length > 0) {
      await sql.unsafe(
        'DELETE FROM field_definitions WHERE group_id = $1 AND id = ANY($2::uuid[])',
        [groupId, staleIds]
      );
    }
  }

  /** Insere uma linha de field_definitions (sem recursão) com key única global. */
  private async insertRow(
    groupId: string,
    input: FieldDefinitionInput,
    parentFieldId: string | null,
    layoutId: string | null,
    sortOrder: number
  ): Promise<string> {
    const sql = getConnection();
    const id = randomUUID();

    // `key` é UNIQUE global: payloads podem repetir a mesma chave (campos
    // novos com mesmo nome em grupos diferentes) — sufixa em caso de colisão.
    let key = input.key ?? `field_${slugifyKey(input.name)}_${Date.now().toString(36)}`;
    while ((await sql.unsafe('SELECT 1 FROM field_definitions WHERE key = $1', [key])).length > 0) {
      key = `${key}_${randomUUID().slice(0, 8)}`;
    }

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
        {
          ...(input.config ?? {}),
          ...(input.conditionalLogic ? { conditionalLogic: input.conditionalLogic } : {}),
        },
        sortOrder,
      ]
    );

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
      isCoreField: Boolean(row['is_core_field']),
      isLocked: Boolean(row['is_locked']),
      coreFieldKey: (row['core_field_key'] as string | null) ?? undefined,
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
      metadata: (row['metadata'] as Record<string, unknown>) ?? {},
      fields,
    };
  }
}

export const fieldGroupService = new FieldGroupService();
