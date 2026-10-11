// @oktis-works/cms - Preparação de banco para os comandos que falam com o DB
//
// Extraído de commands.ts para ser reaproveitado pelo `okcms dev` sem criar
// um ciclo de import (commands ↔ dev). Mesmo comportamento de sempre.

import { join } from 'node:path';

import { initDb } from './db-init.js';

export function getMigrationsDir(options: Record<string, string>): string {
  return options['dir'] ?? join(process.cwd(), 'migrations');
}

export function getTenantId(options: Record<string, string>): string {
  return options['tenant'] ?? 'default';
}

/**
 * Prepara o banco para os comandos db:* em QUALQUER estado — inclusive um
 * banco vazio recém-criado pelo docker compose (sem nem a tabela de controle
 * de migrations, que sequer existe sem o schema core): aplica o schema se
 * faltar, resolve o slug do --tenant para o UUID real de tenants.slug e
 * devolve esse UUID.
 */
export async function prepareDb(options: Record<string, string>): Promise<string> {
  await initDb();
  const { ensureCoreSchema, resolveTenantId, seedCoreData } = await import('@oktis-works/database');
  const applied = await ensureCoreSchema();
  if (applied) {
    console.log('✓ core schema applied (database initialized)');
  }
  // Seed idempotente (roles da política + settings gerais): roda em qualquer
  // banco — sem ele, o primeiro usuário registra e cai em 403 em tudo.
  try {
    const seeded = await seedCoreData();
    if (seeded.roles > 0 || seeded.settings > 0) {
      console.log(`✓ seed: ${seeded.roles} roles, ${seeded.settings} settings created`);
    }
  } catch (error) {
    console.warn('⚠ default data seed failed:', error instanceof Error ? error.message : error);
  }
  return resolveTenantId(getTenantId(options));
}
