// @oktis-works/core - Clone Field Semantics (ACF parity)

import type { ValidatableField } from './structural.js';

export type CloneDisplay = 'seamless' | 'group';

/**
 * Expande campos do tipo `clone` nas definições alvo.
 *
 * - `display: 'seamless'` (default): os campos referenciados entram
 *   diretamente na lista, com os mesmos nomes (valores "inline").
 * - `display: 'group'`: os campos viram subcampos de um pseudo-group com o
 *   nome do clone, e os nomes internos recebem o prefixo `{clone}_`
 *   (valores aninhados em data[clone.name]).
 *
 * Referências inexistentes são ignoradas; clones de clones não são
 * resolvidos recursivamente (profundidade 1, como o modo básico do ACF).
 */
export function expandCloneFields<T extends ValidatableField>(fields: T[]): T[] {
  const byName = new Map<string, T>();
  for (const field of fields) byName.set(field.name, field);

  const result: T[] = [];
  const emittedNames = new Set<string>();

  const emit = (field: T): void => {
    if (emittedNames.has(field.name)) return;
    emittedNames.add(field.name);
    result.push(field);
  };

  for (const field of fields) {
    if (field.type !== 'clone') {
      emit(field);
      continue;
    }

    const config = field.config ?? {};
    const display = (config['display'] as CloneDisplay | undefined) ?? 'seamless';
    const targets = (config['clone'] as string[] | undefined) ?? [];
    const resolved: T[] = [];

    for (const targetName of targets) {
      const target = byName.get(targetName);
      if (!target || target.type === 'clone') continue;
      resolved.push(target);
    }

    if (resolved.length === 0) continue;

    if (display === 'group') {
      emit({
        ...field,
        type: 'group',
        name: field.name,
        label: field.label,
        required: false,
        conditionalLogic: undefined,
        subFields: resolved.map((target) => ({
          ...target,
          name: `${field.name}_${target.name}`,
        })),
      } as T);
      continue;
    }

    for (const target of resolved) emit(target);
  }

  return result;
}
