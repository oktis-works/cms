// @oktis-works/core - Content Field Resolver (binds Field Groups to Content)

import { fieldGroupService } from '../fields/service.js';
import { validateContentData } from '../fields/validation.js';
import { expandCloneFields } from '../fields/clone.js';
import type { ValidationResult, FieldError } from '../fields/validation.js';
import type { LocationContext } from '../fields/location-rules.js';
import type { ValidatableField } from '../fields/types/validators/structural.js';

export interface ContentFieldsResult {
  groups: Array<{ id: string; title: string; key: string; position: string; displayStyle: string }>;
  fields: ValidatableField[];
}

export class ContentFieldResolver {
  /**
   * Resolve os grupos de campos aplicáveis a um contexto de conteúdo
   * (tipo, taxonomia, template, papel do usuário).
   */
  async resolveFor(context: LocationContext): Promise<ContentFieldsResult> {
    const groups = await fieldGroupService.resolveGroupsByLocation(context);

    return {
      groups: groups.map((group) => ({
        id: group.id,
        title: group.title,
        key: group.key ?? '',
        position: group.position ?? 'normal',
        displayStyle: group.displayStyle ?? 'standard',
      })),
      fields: expandCloneFields(await fieldGroupService.toValidatableFields(groups)),
    };
  }

  /**
   * Valida os dados de campos customizados contra os grupos resolvidos.
   */
  async validate(
    context: LocationContext,
    data: Record<string, unknown>
  ): Promise<ValidationResult> {
    const resolved = await this.resolveFor(context);
    return validateContentData(resolved.fields, data);
  }

  /**
   * Validação tolerante: retorna erros sem interromper o fluxo
   * (usado para feedback no editor).
   */
  async validateSoft(
    context: LocationContext,
    data: Record<string, unknown>
  ): Promise<FieldError[]> {
    const result = await this.validate(context, data);
    return result.errors;
  }
}

export const contentFieldResolver = new ContentFieldResolver();
