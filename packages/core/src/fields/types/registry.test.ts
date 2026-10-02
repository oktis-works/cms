// @oktis-works/core - Field Type Catalog Tests

import { describe, it, expect } from 'vitest';
import {
  listFieldTypes,
  listFieldTypesByCategory,
  getFieldType,
  registerFieldType,
  fieldTypeRegistry,
  FIELD_TYPE_CATEGORIES,
} from './registry.js';

describe('FieldTypeCatalog', () => {
  it('cataloga exatamente os 34 tipos de campos', () => {
    const types = listFieldTypes().filter((type) => type.type !== 'plugin_custom_test');
    expect(types).toHaveLength(34);
    expect(new Set(types.map((type) => type.type)).size).toBe(34);
  });

  it('expõe as 5 categorias com labels e ícones', () => {
    expect(FIELD_TYPE_CATEGORIES).toHaveLength(5);

    for (const category of FIELD_TYPE_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.icon.length).toBeGreaterThan(0);
    }
  });

  it('distribui os tipos entre as categorias esperadas', () => {
    const grouped = listFieldTypesByCategory();

    expect(grouped['basico']).toHaveLength(7);
    expect(grouped['conteudo']).toHaveLength(10);
    expect(grouped['escolha']).toHaveLength(4);
    expect(grouped['relacional']).toHaveLength(6);
    expect(grouped['estrutura']).toHaveLength(7);

    const total = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(34);
  });

  it('marca message/tab/accordion como layout-only sem suporte a condições', () => {
    for (const type of ['message', 'tab', 'accordion']) {
      expect(getFieldType(type)?.isLayout).toBe(true);
      expect(getFieldType(type)?.supportsConditions).toBe(false);
    }
  });

  it('flexible_content e clone não suportam lógica condicional; text sim', () => {
    expect(getFieldType('flexible_content')?.supportsConditions).toBe(false);
    expect(getFieldType('clone')?.supportsConditions).toBe(false);
    expect(getFieldType('text')?.supportsConditions).toBe(true);
  });

  it('permite registrar tipos customizados de plugins (DECI-023)', () => {
    registerFieldType({
      type: 'plugin_stars',
      label: 'Estrelas',
      category: 'basico',
      icon: 'star',
      supportsConditions: true,
      isLayout: false,
    });

    expect(getFieldType('plugin_stars')?.label).toBe('Estrelas');
    expect(listFieldTypesByCategory()['basico'].some((type) => type.type === 'plugin_stars')).toBe(true);

    // remove para não poluir outros testes (Map mutável)
    fieldTypeRegistry.delete('plugin_stars');
  });

  it('getFieldType retorna null para tipo desconhecido', () => {
    expect(getFieldType('tipo_inexistente_xyz')).toBeNull();
  });
});
