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
}
