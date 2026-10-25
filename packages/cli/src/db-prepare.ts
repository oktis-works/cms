// @oktis-works/cms - Database preparation shared by CLI database workflows
//
// This module intentionally keeps connection/schema preparation separate from
// seeding. Read-only commands must not recreate demo data or rewrite tenant
// records as an incidental side effect.

import { join } from 'node:path';

import { initDb } from './db-init.js';

export function getMigrationsDir(options: Record<string, string>): string {
  return options['dir'] ?? join(process.cwd(), 'migrations');
}

export function getTenantId(options: Record<string, string>): string {
  return options['tenant'] ?? 'default';
}

export interface PrepareDbOptions {
  ensureSchema?: boolean;
  seed?: boolean;
  createDefaultTenant?: boolean;
  resolveTenant?: boolean;
  adoptLegacy?: boolean;
}

/** Prepare the database connection and, when requested, the core schema/seed data. */
export async function prepareDb(
  options: Record<string, string>,
  prepareOptions: PrepareDbOptions = {}
): Promise<string> {
  await initDb();
  const { ensureCoreSchema, resolveTenantId, seedCoreData, seedDemoContent, seedActivateDefaultTheme, seedDefaultFieldGroups } = await import('@oktis-works/database');
  if (prepareOptions.ensureSchema !== false) {
    const applied = await ensureCoreSchema({ adoptLegacy: prepareOptions.adoptLegacy });
    if (applied) {
      console.log('✓ core schema applied (database initialized)');
    }
  }

  if (prepareOptions.seed) {
    const seeded = await seedCoreData();
    if (seeded.roles > 0 || seeded.settings > 0) {
      console.log(`✓ seed: ${seeded.roles} roles, ${seeded.settings} settings created`);
    }
    const fieldGroups = await seedDefaultFieldGroups();
    if (fieldGroups.fieldGroups > 0 || fieldGroups.fieldDefinitions > 0) {
      console.log(`✓ field groups: ${fieldGroups.fieldGroups} groups, ${fieldGroups.fieldDefinitions} definitions created`);
    }
    const demo = await seedDemoContent();
    const total = demo.pages + demo.posts + demo.menus + demo.readingSettings;
    if (total > 0) {
      console.log(`✓ demo content: ${demo.pages} pages, ${demo.posts} posts, ${demo.menus} menus, ${demo.readingSettings} reading settings`);
    }
    await seedActivateDefaultTheme();
    console.log('✓ default theme activated');
  }
  if (prepareOptions.resolveTenant === false) return '';
  return resolveTenantId(getTenantId(options), {
    createDefault: prepareOptions.createDefaultTenant !== false,
  });
}
