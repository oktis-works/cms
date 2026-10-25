// @oktis-works/admin - Shared component types

import type { ConditionalLogic } from '@oktis-works/types';

export interface ResolvedFieldDefinition {
  id: string;
  type: string;
  name: string;
  key: string;
  label: string;
  instructions?: string;
  required: boolean;
  config: Record<string, unknown>;
  conditionalLogic: ConditionalLogic | null;
  sortOrder: number;
  subFields: ResolvedFieldDefinition[];
  layouts: Array<{
    name: string;
    label: string;
    display: string;
    min?: number;
    max?: number;
    subFields: ResolvedFieldDefinition[];
  }>;
  // Plugin-specific extensions
  adminComponentPath?: string;
  adminRendererPath?: string;
  configSchema?: Record<string, unknown>;
  isPluginType?: boolean;
  pluginName?: string;
  isCoreField?: boolean;
  isLocked?: boolean;
  coreFieldKey?: string;
}

export interface ResolvedFieldGroup {
  id: string;
  title: string;
  key: string;
  position?: 'normal' | 'side' | 'after_title';
  displayStyle?: 'standard' | 'seamless' | 'grouped';
  active?: boolean;
  metadata?: Record<string, unknown>;
  fields: ResolvedFieldDefinition[];
}
