// Common Types for OkCMS

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export interface AppContext {
  tenantId?: string;
  userId?: string;
  requestId: string;
  timestamp: Date;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface CacheOptions {
  ttl?: number;
  key?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    pagination?: PaginationMeta;
    requestId: string;
  };
}

// Re-export ConditionalLogic for frontend maintainability (professional: shared types in @oktis-works/types)
export type { ConditionalLogic, ConditionalRule, ConditionalGroup, ConditionOperator } from '@oktis-works/validation';
