// @oktis-works/core - Field Type Registry

export type FieldCategory = 'basico' | 'conteudo' | 'escolha' | 'relacional' | 'estrutura';

export interface FieldTypeDefinition {
  type: string;
  label: string;
  category: FieldCategory;
  icon: string;
  supportsConditions: boolean;
  isLayout: boolean;
}

export const FIELD_TYPE_CATEGORIES: Array<{ id: FieldCategory; label: string; icon: string }> = [
  { id: 'basico', label: 'Básico', icon: 'type' },
  { id: 'conteudo', label: 'Conteúdo', icon: 'file-text' },
  { id: 'escolha', label: 'Escolha', icon: 'check-square' },
  { id: 'relacional', label: 'Relacional', icon: 'list-tree' },
  { id: 'estrutura', label: 'Estrutura', icon: 'layout-template' },
];

const DEFINITIONS: FieldTypeDefinition[] = [
  { type: 'text', label: 'Texto', category: 'basico', icon: 'type', supportsConditions: true, isLayout: false },
  { type: 'textarea', label: 'Área de Texto', category: 'basico', icon: 'align-left', supportsConditions: true, isLayout: false },
  { type: 'number', label: 'Número', category: 'basico', icon: 'hash', supportsConditions: true, isLayout: false },
  { type: 'range', label: 'Intervalo', category: 'basico', icon: 'sliders-horizontal', supportsConditions: true, isLayout: false },
  { type: 'email', label: 'E-mail', category: 'basico', icon: 'mail', supportsConditions: true, isLayout: false },
  { type: 'url', label: 'URL', category: 'basico', icon: 'link-2', supportsConditions: true, isLayout: false },
  { type: 'password', label: 'Senha', category: 'basico', icon: 'lock', supportsConditions: true, isLayout: false },
  { type: 'slug', label: 'Slug', category: 'basico', icon: 'tag', supportsConditions: true, isLayout: false },

  { type: 'wysiwyg', label: 'Editor WYSIWYG', category: 'conteudo', icon: 'file-text', supportsConditions: true, isLayout: false },
  { type: 'image', label: 'Imagem', category: 'conteudo', icon: 'image', supportsConditions: true, isLayout: false },
  { type: 'gallery', label: 'Galeria', category: 'conteudo', icon: 'images', supportsConditions: true, isLayout: false },
  { type: 'file', label: 'Arquivo', category: 'conteudo', icon: 'paperclip', supportsConditions: true, isLayout: false },
  { type: 'oembed', label: 'oEmbed', category: 'conteudo', icon: 'video', supportsConditions: true, isLayout: false },
  { type: 'google_map', label: 'Mapa do Google', category: 'conteudo', icon: 'map-pin', supportsConditions: true, isLayout: false },
  { type: 'date_picker', label: 'Seletor de Data', category: 'conteudo', icon: 'calendar', supportsConditions: true, isLayout: false },
  { type: 'date_time_picker', label: 'Data e Hora', category: 'conteudo', icon: 'calendar-clock', supportsConditions: true, isLayout: false },
  { type: 'time_picker', label: 'Hora', category: 'conteudo', icon: 'clock', supportsConditions: true, isLayout: false },
  { type: 'color_picker', label: 'Cor', category: 'conteudo', icon: 'palette', supportsConditions: true, isLayout: false },

  { type: 'select', label: 'Seleção', category: 'escolha', icon: 'list', supportsConditions: true, isLayout: false },
  { type: 'checkbox', label: 'Checkbox', category: 'escolha', icon: 'check-square', supportsConditions: true, isLayout: false },
  { type: 'radio', label: 'Radio', category: 'escolha', icon: 'circle-dot', supportsConditions: true, isLayout: false },
  { type: 'true_false', label: 'Verdadeiro/Falso', category: 'escolha', icon: 'toggle-right', supportsConditions: true, isLayout: false },

  { type: 'link', label: 'Link', category: 'relacional', icon: 'link', supportsConditions: true, isLayout: false },
  { type: 'page_link', label: 'Link de Página', category: 'relacional', icon: 'external-link', supportsConditions: true, isLayout: false },
  { type: 'post_object', label: 'Objeto de Post', category: 'relacional', icon: 'box', supportsConditions: true, isLayout: false },
  { type: 'relationship', label: 'Relacionamento', category: 'relacional', icon: 'list-tree', supportsConditions: true, isLayout: false },
  { type: 'taxonomy', label: 'Taxonomia', category: 'relacional', icon: 'tags', supportsConditions: true, isLayout: false },
  { type: 'user', label: 'Usuário', category: 'relacional', icon: 'user', supportsConditions: true, isLayout: false },

  { type: 'group', label: 'Grupo', category: 'estrutura', icon: 'boxes', supportsConditions: true, isLayout: false },
  { type: 'clone', label: 'Clone', category: 'estrutura', icon: 'copy', supportsConditions: false, isLayout: false },
  { type: 'repeater', label: 'Repeater', category: 'estrutura', icon: 'rows-3', supportsConditions: true, isLayout: false },
  { type: 'flexible_content', label: 'Conteúdo Flexível', category: 'estrutura', icon: 'layout-template', supportsConditions: false, isLayout: false },
  { type: 'message', label: 'Mensagem', category: 'estrutura', icon: 'message-square', supportsConditions: false, isLayout: true },
  { type: 'accordion', label: 'Accordion', category: 'estrutura', icon: 'layers', supportsConditions: false, isLayout: true },
  { type: 'tab', label: 'Tab', category: 'estrutura', icon: 'panel-top', supportsConditions: false, isLayout: true },
];

export const fieldTypeRegistry = new Map<string, FieldTypeDefinition>(
  DEFINITIONS.map((definition) => [definition.type, definition])
);

export function getFieldType(type: string): FieldTypeDefinition | null {
  return fieldTypeRegistry.get(type) ?? null;
}

export function listFieldTypes(): FieldTypeDefinition[] {
  return [...fieldTypeRegistry.values()];
}

export function listFieldTypesByCategory(): Record<FieldCategory, FieldTypeDefinition[]> {
  const result = {} as Record<FieldCategory, FieldTypeDefinition[]>;

  for (const category of FIELD_TYPE_CATEGORIES) {
    result[category.id] = [];
  }

  // Lê do Map vivo para incluir tipos registrados em runtime por plugins.
  for (const definition of fieldTypeRegistry.values()) {
    const bucket = result[definition.category];
    if (bucket) bucket.push(definition);
  }

  return result;
}

export function registerFieldType(definition: FieldTypeDefinition): void {
  fieldTypeRegistry.set(definition.type, definition);
}
