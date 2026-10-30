/**
 * WP Migrate - Main Entry Point
 * Orchestrates the WordPress to OkCMS migration
 */

import { createWPConnector, testWPConnection } from './connectors/mysql';
import { inspectWPSchema, validateWPSchema, WPSchemaAnalysis } from './connectors/wp-schema';
import { runMigration } from './runners/sequential';
import { ConsoleReporter } from './reporters/console';
import { JSONReporter } from './reporters/json';
import { SummaryReporter } from './reporters/summary';
import { MigrationReport, WPMigrationConfig, MigrationPhase, PhaseStats } from './types';

export interface WPMigrateOptions extends Partial<WPMigrationConfig> {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  prefix?: string;
  tenant: string;
  dryRun?: boolean;
  batchSize?: number;
  resumeFrom?: string;
  skipUsers?: boolean;
  skipMedia?: boolean;
  copyFiles?: boolean;
  outputReport?: string;
  outputJson?: string;
  outputSummary?: string;
  verbose?: boolean;
  quiet?: boolean;
}

export interface WPMigrateResult {
  success: boolean;
  report: MigrationReport;
  error?: Error;
}

/**
 * CLI handler for `okcms wp import`
 */
export async function runWPImport(args: string[], options: Record<string, string>): Promise<void> {
  // Parse options
  const parsedOptions = parseWPImportOptions(args, options);

  const result = await migrateWordPress(parsedOptions);

  if (result.error) {
    console.error(`Migration failed: ${result.error.message}`);
    process.exitCode = 1;
  } else if (!result.success) {
    console.error('Migration completed with errors');
    process.exitCode = 1;
  }
}

/**
 * CLI handler for `okcms wp validate`
 */
export async function runWPValidate(args: string[], options: Record<string, string>): Promise<void> {
  const parsedOptions = parseWPValidateOptions(args, options);

  const result = await validateWordPress(parsedOptions);

  console.log('\nValidation Results:');
  console.log(`  Valid: ${result.valid ? 'Yes' : 'No'}`);
  console.log(`  Errors: ${result.errors.length}`);
  console.log(`  Warnings: ${result.warnings.length}`);

  if (result.analysis) {
    console.log(`  Post Types: ${result.analysis.contentTypes.size}`);
    console.log(`  Taxonomies: ${result.analysis.taxonomies.size}`);
    console.log(`  ACF Field Groups: ${result.analysis.acfFieldGroups.length}`);
    console.log(`  SEO Plugins: ${result.analysis.seoPlugins.join(', ') || 'None'}`);
    console.log(`  Multisite: ${result.analysis.multisite ? 'Yes' : 'No'}`);
    console.log(`  WP Version: ${result.analysis.version}`);
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of result.errors) {
      console.log(`  ✗ ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of result.warnings) {
      console.log(`  ⚠ ${warning}`);
    }
  }

  if (!result.valid) {
    process.exitCode = 1;
  }
}

/**
 * Parse wp import command options
 */
function parseWPImportOptions(args: string[], options: Record<string, string>): WPMigrateOptions {
  // Support both --key=value and --key value formats
  const parsed: Record<string, string> = { ...options };

  // Parse positional args for key=value pairs
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      if (key) {
        parsed[key] = valueParts.join('=') || 'true';
      }
    }
  }

  return {
    host: parsed['wp-host'] ?? parsed['host'] ?? '',
    port: parsed['wp-port'] ? parseInt(parsed['wp-port'], 10) : parsed['port'] ? parseInt(parsed['port'], 10) : 3306,
    user: parsed['wp-user'] ?? parsed['user'] ?? '',
    password: parsed['wp-password'] ?? parsed['password'] ?? '',
    database: parsed['wp-database'] ?? parsed['database'] ?? '',
    prefix: parsed['wp-prefix'] ?? parsed['prefix'] ?? 'wp_',
    tenant: (parsed['tenant'] ?? parsed['tenant'] ?? 'default') as string,
    dryRun: parsed['dry-run'] !== undefined,
    batchSize: parsed['batch-size'] ? parseInt(parsed['batch-size'], 10) : 500,
    resumeFrom: parsed['resume-from'],
    skipUsers: parsed['skip-users'] !== undefined,
    skipMedia: parsed['skip-media'] !== undefined,
    copyFiles: parsed['copy-files'] !== undefined,
    outputReport: parsed['output-report'],
    outputJson: parsed['output-json'],
    outputSummary: parsed['output-summary'],
    verbose: parsed['verbose'] !== undefined,
    quiet: parsed['quiet'] !== undefined,
  } as WPMigrateOptions;
}

/**
 * Parse wp validate command options
 */
function parseWPValidateOptions(args: string[], options: Record<string, string>): WPMigrateOptions {
  const parsed: Record<string, string> = { ...options };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      if (key) {
        parsed[key] = valueParts.join('=') || 'true';
      }
    }
  }

  return {
    host: parsed['wp-host'] ?? parsed['host'] ?? '',
    port: parsed['wp-port'] ? parseInt(parsed['wp-port'], 10) : parsed['port'] ? parseInt(parsed['port'], 10) : 3306,
    user: parsed['wp-user'] ?? parsed['user'] ?? '',
    password: parsed['wp-password'] ?? parsed['password'] ?? '',
    database: parsed['wp-database'] ?? parsed['database'] ?? '',
    prefix: parsed['wp-prefix'] ?? parsed['prefix'] ?? 'wp_',
    tenant: (parsed['tenant'] ?? parsed['tenant'] ?? 'default') as string,
    dryRun: true,
    batchSize: 500,
    skipUsers: false,
    skipMedia: false,
    copyFiles: false,
    verbose: parsed['verbose'] !== undefined,
    quiet: parsed['quiet'] !== undefined,
  } as WPMigrateOptions;
}

/**
 * Main migration function
 */
export async function migrateWordPress(options: WPMigrateOptions): Promise<WPMigrateResult> {
  const config: WPMigrationConfig = {
    host: options.host,
    port: options.port ?? 3306,
    user: options.user,
    password: options.password,
    database: options.database,
    prefix: options.prefix ?? 'wp_',
    tenantSlug: options.tenant,
    dryRun: options.dryRun ?? false,
    batchSize: options.batchSize ?? 500,
    resumeFrom: options.resumeFrom,
    skipUsers: options.skipUsers ?? false,
    skipMedia: options.skipMedia ?? false,
    copyFiles: options.copyFiles ?? false,
    authorMap: new Map(),
    outputReport: options.outputReport,
    unmappedMetaKeys: [],
  };

  // Initialize reporters
  const consoleReporter = new ConsoleReporter({ showProgressBars: !options.quiet });
  const jsonReporter = options.outputJson ? new JSONReporter(options.outputJson) : null;
  const summaryReporter = options.outputSummary ? new SummaryReporter(options.outputSummary) : null;

  // Test connection
  if (!options.quiet) {
    console.log('Testing WordPress database connection...');
  }

  const connectionTest = await testWPConnection(config);
  if (!connectionTest.success) {
    return {
      success: false,
      report: createEmptyReport(config),
      error: new Error(`Connection failed: ${connectionTest.error}`),
    };
  }

  if (!options.quiet) {
    console.log(colorize(`✓ Connected to ${connectionTest.version}`, 'green'));
  }

  // Create connector
  const connector = createWPConnector(config);

  try {
    await connector.connect();

    // Validate schema
    const validation = await validateWPSchema(connector);
    if (!validation.valid) {
      return {
        success: false,
        report: createEmptyReport(config),
        error: new Error(`Schema validation failed: ${validation.errors.join(', ')}`),
      };
    }

    if (!options.quiet && validation.warnings.length > 0) {
      for (const warning of validation.warnings) {
        console.log(colorize(`⚠ ${warning}`, 'yellow'));
      }
    }

    // Analyze schema (for dry-run info)
    let analysis: WPSchemaAnalysis | null = null;
    if (options.dryRun || options.verbose) {
      if (!options.quiet) console.log('Analyzing WordPress schema...');
      analysis = await inspectWPSchema(connector);
      if (!options.quiet) {
        console.log(colorize(`✓ Found ${analysis.contentTypes.size} post types, ${analysis.taxonomies.size} taxonomies`, 'green'));
        if (analysis.acfFieldGroups.length > 0) {
          console.log(colorize(`✓ Found ${analysis.acfFieldGroups.length} ACF field groups`, 'green'));
        }
        if (analysis.seoPlugins.length > 0) {
          console.log(colorize(`✓ Detected SEO plugins: ${analysis.seoPlugins.join(', ')}`, 'green'));
        }
      }
    }

    // Dry run: just show plan
    if (options.dryRun) {
      consoleReporter.printDryRunPlan([
        'tenant-users',
        'content-types',
        'taxonomies',
        'content',
        'postmeta',
        'media',
        'content-taxonomy',
        'comments',
        'menus',
        'options',
        'redirects',
        'validation',
      ]);

      if (analysis) {
        console.log('\nDetected Post Types:');
        for (const [type, info] of analysis.contentTypes) {
          console.log(`  - ${type}: ${info.count} posts`);
        }
      }

      return {
        success: true,
        report: createEmptyReport(config),
      };
    }

    // Run migration
    if (!options.quiet) {
      console.log(`\n${colorize('Starting migration...', 'bold')}`);
    }

    const report = await runMigration(
      connector,
      config,
      (phase, current, total) => {
        consoleReporter.onProgress(phase, current, total);
        if (jsonReporter) {
          jsonReporter.writeIncremental(phase, { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 }, [], new Date().toISOString());
        }
      },
      (phase, stats) => {
        consoleReporter.onPhaseComplete(phase, stats);
      },
      (error) => {
        consoleReporter.onError(error);
      }
    );

    // Generate reports
    if (options.outputJson) {
      await jsonReporter!.write(report);
      if (!options.quiet) console.log(colorize(`✓ JSON report saved to ${options.outputJson}`, 'green'));
    }

    if (options.outputSummary) {
      await summaryReporter!.write(report);
      if (!options.quiet) console.log(colorize(`✓ Summary report saved to ${options.outputSummary}`, 'green'));
    }

    // Print final summary
    if (!options.quiet) {
      consoleReporter.printReport(report);
    }

    return { success: report.totals.errors === 0, report };
  } catch (error) {
    return {
      success: false,
      report: createEmptyReport(config),
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  } finally {
    await connector.disconnect();
  }
}

/**
 * Validate WordPress database without migrating
 */
export async function validateWordPress(options: WPMigrateOptions): Promise<{ valid: boolean; analysis?: WPSchemaAnalysis; errors: string[]; warnings: string[] }> {
  const config: WPMigrationConfig = {
    host: options.host,
    port: options.port ?? 3306,
    user: options.user,
    password: options.password,
    database: options.database,
    prefix: options.prefix ?? 'wp_',
    tenantSlug: options.tenant,
    dryRun: true,
    batchSize: 500,
    skipUsers: false,
    skipMedia: false,
    copyFiles: false,
    authorMap: new Map(),
    unmappedMetaKeys: [],
  };

  const connector = createWPConnector(config);

  try {
    await connector.connect();

    const validation = await validateWPSchema(connector);
    const analysis = await inspectWPSchema(connector);

    return {
      valid: validation.valid,
      analysis,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      warnings: [],
    };
  } finally {
    await connector.disconnect();
  }
}

/**
 * Create empty report for error cases
 */
function createEmptyReport(config: WPMigrationConfig): MigrationReport {
  const emptyStats: Record<MigrationPhase, PhaseStats> = {
    'tenant-users': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'content-types': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'taxonomies': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'content': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'postmeta': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'termmeta': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'media': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'content-taxonomy': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'comments': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'menus': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'options': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'redirects': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'validation': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    'complete': { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...configWithoutPassword } = config;
  return {
    startedAt: new Date().toISOString(),
    config: { ...configWithoutPassword, password: '***' } as WPMigrationConfig,
    phases: emptyStats,
    totals: { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    errors: [],
    unmappedMetaKeys: [],
    warnings: [],
  };
}

// Re-export colorize for internal use
function colorize(text: string, color: 'reset' | 'bold' | 'dim' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'gray'): string {
  const COLORS = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
  };
  return `${COLORS[color]}${text}${COLORS.reset}`;
}