/**
 * Canonical command catalog shared by help, the interactive wizard, and
 * validation tests. Command handlers remain in commands.ts; this module only
 * describes the public command surface and its operational safety contract.
 */

export type CommandRisk = 'read-only' | 'mutating' | 'destructive';

export interface CommandMetadata {
  group: string;
  requiresProject: boolean;
  requiresDatabase: boolean;
  risk: CommandRisk;
  interactive: boolean;
  sensitiveOptions?: readonly string[];
}

export const COMMAND_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Project', ['init', 'menu', 'start', 'stop', 'status', 'dev', 'doctor', 'config']],
  ['Database', ['db:migrate', 'db:rollback', 'db:status', 'db:inventory', 'db:backup', 'db:restore', 'seed', 'user:create']],
  ['Migration', ['wp']],
  ['Extensions', ['plugin:create', 'plugin:install', 'plugin:list', 'plugin:search', 'plugin:manage', 'theme:create', 'theme:install', 'theme:list', 'theme:search', 'theme:manage', 'theme:build']],
  ['Deploy', ['build', 'update', 'redeploy', 'rollback', 'deploy']],
  ['System', ['media:migrate', 'system:status', 'i18n:extract']],
];

const READ_ONLY = new Set([
  'menu', 'status', 'doctor', 'plugin:list', 'plugin:search', 'theme:list', 'theme:search',
  'db:status', 'db:inventory', 'system:status',
  'wp',
]);

const DESTRUCTIVE = new Set([
  'db:migrate', 'db:rollback', 'db:restore', 'seed', 'user:create', 'config', 'plugin:install', 'plugin:manage',
  'theme:install', 'theme:manage', 'media:migrate', 'rollback', 'update', 'redeploy', 'deploy',
]);

const PROJECT_REQUIRED = new Set([
  'start', 'stop', 'status', 'dev', 'config', 'update', 'redeploy', 'deploy', 'rollback',
  'db:migrate', 'db:rollback', 'db:status', 'db:backup', 'db:restore', 'seed', 'user:create',
  'plugin:install', 'plugin:list', 'plugin:manage', 'theme:install', 'theme:list', 'theme:manage',
  'theme:build', 'build', 'media:migrate', 'system:status', 'i18n:extract',
  'wp',
]);

const DATABASE_REQUIRED = new Set([
  'start', 'stop', 'status', 'dev', 'db:migrate', 'db:rollback', 'db:status', 'db:backup',
  'db:restore', 'seed', 'user:create', 'plugin:install', 'plugin:list', 'plugin:manage',
  'theme:install', 'theme:list', 'theme:manage', 'system:status',
  'wp',
]);

const INTERACTIVE = new Set(['init', 'menu', 'dev', 'config', 'update', 'redeploy', 'rollback', 'deploy']);

const SENSITIVE_OPTIONS: Record<string, readonly string[]> = {
  config: ['set', 'show-secrets'],
  dev: ['password'],
  'user:create': ['password'],
};

export function commandMetadata(name: string): CommandMetadata {
  const risk: CommandRisk = DESTRUCTIVE.has(name)
    ? 'destructive'
    : READ_ONLY.has(name)
      ? 'read-only'
      : 'mutating';
  return {
    group: COMMAND_GROUPS.find(([, names]) => names.includes(name))?.[0] ?? 'Other',
    requiresProject: PROJECT_REQUIRED.has(name),
    requiresDatabase: DATABASE_REQUIRED.has(name),
    risk,
    interactive: INTERACTIVE.has(name),
    sensitiveOptions: SENSITIVE_OPTIONS[name],
  };
}

export function commandGroupNames(): Array<[string, string[]]> {
  return COMMAND_GROUPS.map(([group, names]) => [group, [...names]]);
}

export function registeredCommandNames(): string[] {
  return COMMAND_GROUPS.flatMap(([, names]) => names);
}
