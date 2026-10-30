/**
 * JSON Reporter
 * Machine-readable migration report output
 */

import { MigrationReport, MigrationError, MigrationPhase, PhaseStats } from '../types';
import { promises as fs } from 'fs';
import { join } from 'path';

export class JSONReporter {
  private outputPath: string;

  constructor(outputPath: string) {
    this.outputPath = outputPath;
  }

  /**
   * Write report to JSON file
   */
  async write(report: MigrationReport): Promise<void> {
    const output = {
      ...report,
      // Ensure dates are ISO strings
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      phases: Object.fromEntries(
        Object.entries(report.phases).map(([phase, stats]) => [
          phase,
          {
            created: stats.created,
            updated: stats.updated,
            skipped: stats.skipped,
            errors: stats.errors,
            durationMs: stats.durationMs,
          }
        ])
      ),
      errors: report.errors.map(e => ({
        phase: e.phase,
        wpTable: e.wpTable,
        wpId: e.wpId,
        field: e.field,
        message: e.message,
        severity: e.severity,
        timestamp: e.timestamp,
      })),
      unmappedMetaKeys: report.unmappedMetaKeys,
      warnings: report.warnings,
    };

    await fs.mkdir(join(this.outputPath, '..'), { recursive: true });
    await fs.writeFile(this.outputPath, JSON.stringify(output, null, 2));
  }

  /**
   * Write incremental update (for long-running migrations)
   */
  async writeIncremental(
    phase: MigrationPhase,
    stats: PhaseStats,
    errors: MigrationError[],
    startedAt: string
  ): Promise<void> {
    const update = {
      phase,
      stats: {
        created: stats.created,
        updated: stats.updated,
        skipped: stats.skipped,
        errors: stats.errors,
        durationMs: stats.durationMs,
      },
      errors: errors.map(e => ({
        phase: e.phase,
        wpTable: e.wpTable,
        wpId: e.wpId,
        field: e.field,
        message: e.message,
        severity: e.severity,
        timestamp: e.timestamp,
      })),
      timestamp: new Date().toISOString(),
      startedAt,
    };

    const incrementalPath = this.outputPath.replace('.json', '-incremental.json');
    await fs.writeFile(incrementalPath, JSON.stringify(update, null, 2));
  }
}

/**
 * Write report to stdout as JSON
 */
export function printJSONReport(report: MigrationReport): void {
  const output = {
    ...report,
    phases: Object.fromEntries(
      Object.entries(report.phases).map(([phase, stats]) => [
        phase,
        {
          created: stats.created,
          updated: stats.updated,
          skipped: stats.skipped,
          errors: stats.errors,
          durationMs: stats.durationMs,
        }
      ])
    ),
    errors: report.errors.map(e => ({
      phase: e.phase,
      wpTable: e.wpTable,
      wpId: e.wpId,
      field: e.field,
      message: e.message,
      severity: e.severity,
      timestamp: e.timestamp,
    })),
    unmappedMetaKeys: report.unmappedMetaKeys,
    warnings: report.warnings,
  };

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Create a summary JSON for quick parsing
 */
export function createSummaryJSON(report: MigrationReport): object {
  return {
    success: report.totals.errors === 0,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    durationMs: report.totals.durationMs,
    totals: {
      created: report.totals.created,
      updated: report.totals.updated,
      skipped: report.totals.skipped,
      errors: report.totals.errors,
    },
    phases: Object.fromEntries(
      Object.entries(report.phases).map(([phase, stats]) => [
        phase,
        {
          created: stats.created,
          updated: stats.updated,
          skipped: stats.skipped,
          errors: stats.errors,
        }
      ])
    ),
    errorCount: report.errors.length,
    warningCount: report.warnings.length,
    unmappedMetaKeyCount: report.unmappedMetaKeys.length,
  };
}