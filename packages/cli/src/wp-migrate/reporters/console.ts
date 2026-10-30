/**
 * Console Reporter
 * Pretty CLI output with progress bars and colors
 */

import { MigrationPhase, PhaseStats, MigrationReport, MigrationError } from '../types';

const PHASE_LABELS: Record<MigrationPhase, string> = {
  'tenant-users': 'Users & Roles',
  'content-types': 'Content Types',
  'taxonomies': 'Taxonomies',
  'content': 'Content',
  'postmeta': 'Custom Fields',
  'termmeta': 'Term Meta',
  'media': 'Media',
  'content-taxonomy': 'Content-Taxonomy Links',
  'comments': 'Comments',
  'menus': 'Menus',
  'options': 'Settings',
  'redirects': 'Redirects',
  'validation': 'Validation',
  'complete': 'Complete',
};

const PHASE_ICONS: Record<MigrationPhase, string> = {
  'tenant-users': '👥',
  'content-types': '📝',
  'taxonomies': '🏷️',
  'content': '📄',
  'postmeta': '🔧',
  'termmeta': '🏷️',
  'media': '🖼️',
  'content-taxonomy': '🔗',
  'comments': '💬',
  'menus': '🧭',
  'options': '⚙️',
  'redirects': '🔀',
  'validation': '✅',
  'complete': '🎉',
};

// ANSI color codes
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

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export class ConsoleReporter {
  private startTime = Date.now();
  private currentPhase: MigrationPhase | null = null;
  private phaseStartTime = 0;
  private showProgressBars = true;

  constructor(options?: { showProgressBars?: boolean }) {
    this.showProgressBars = options?.showProgressBars ?? true;
  }

  /**
   * Called when a phase starts
   */
  onPhaseStart(phase: MigrationPhase): void {
    this.currentPhase = phase;
    this.phaseStartTime = Date.now();

    const icon = PHASE_ICONS[phase] ?? '▶';
    const label = PHASE_LABELS[phase] ?? phase;

    console.log(`\n${colorize(`${icon} ${label}`, 'cyan')}`);
    console.log(colorize('─'.repeat(50), 'gray'));
  }

  /**
   * Called with progress updates
   */
  onProgress(phase: MigrationPhase, current: number, total: number): void {
    if (!this.showProgressBars || total <= 0) return;

    const percentage = Math.round((current / total) * 100);
    const barWidth = 30;
    const filled = Math.round((current / total) * barWidth);
    const empty = barWidth - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const elapsed = Date.now() - this.phaseStartTime;
    const eta = current > 0 ? (elapsed / current) * (total - current) : 0;

    process.stdout.write(
      `\r${colorize(`[${bar}]`, 'green')} ${formatNumber(current)}/${formatNumber(total)} (${percentage}%) ` +
      colorize(`Elapsed: ${formatDuration(elapsed)}`, 'gray') +
      ` ETA: ${colorize(formatDuration(eta), 'gray')}`
    );
  }

  /**
   * Called when a phase completes
   */
  onPhaseComplete(phase: MigrationPhase, stats: PhaseStats): void {
    if (this.showProgressBars) {
      process.stdout.write('\n');
    }

    const icon = PHASE_ICONS[phase] ?? '✓';
    const label = PHASE_LABELS[phase] ?? phase;

    console.log(
      colorize(`${icon} ${label}: `, 'green') +
      colorize(`Created: ${formatNumber(stats.created)}`, 'green') + ', ' +
      colorize(`Updated: ${formatNumber(stats.updated)}`, 'blue') + ', ' +
      colorize(`Skipped: ${formatNumber(stats.skipped)}`, 'yellow') + ', ' +
      colorize(`Errors: ${formatNumber(stats.errors)}`, stats.errors > 0 ? 'red' : 'green') +
      colorize(` (${formatDuration(stats.durationMs)})`, 'gray')
    );
  }

  /**
   * Called on error
   */
  onError(error: MigrationError): void {
    console.log(
      `\n${colorize('✗ Error:', 'red')} ${error.message}` +
      colorize(` [${error.phase}/${error.wpTable}/${error.wpId}]`, 'gray')
    );
  }

  /**
   * Print final summary report
   */
  printReport(report: MigrationReport): void {
    const totalDuration = Date.now() - this.startTime;

    console.log('\n' + colorize('═'.repeat(60), 'cyan'));
    console.log(colorize(`${COLORS.bold}Migration Complete${COLORS.reset}`, 'cyan'));
    console.log(colorize('═'.repeat(60), 'cyan'));

    // Summary stats
    console.log(`\n${colorize('Summary:', 'bold')}`);
    console.log(`  ${colorize('Total Created:', 'green')} ${formatNumber(report.totals.created)}`);
    console.log(`  ${colorize('Total Updated:', 'blue')} ${formatNumber(report.totals.updated)}`);
    console.log(`  ${colorize('Total Skipped:', 'yellow')} ${formatNumber(report.totals.skipped)}`);
    console.log(`  ${colorize('Total Errors:', report.totals.errors > 0 ? 'red' : 'green')} ${formatNumber(report.totals.errors)}`);
    console.log(`  ${colorize('Total Duration:', 'cyan')} ${formatDuration(totalDuration)}`);

    // Phase breakdown
    console.log(`\n${colorize('Phase Breakdown:', 'bold')}`);
    for (const [phase, phaseStats] of Object.entries(report.phases)) {
      if (phaseStats.created === 0 && phaseStats.updated === 0 && phaseStats.skipped === 0 && phaseStats.errors === 0) continue;

      const icon = PHASE_ICONS[phase as MigrationPhase] ?? '•';
      console.log(
        `  ${icon} ${PHASE_LABELS[phase as MigrationPhase] ?? phase}: ` +
        `${colorize(formatNumber(phaseStats.created), 'green')}/` +
        `${colorize(formatNumber(phaseStats.updated), 'blue')}/` +
        `${colorize(formatNumber(phaseStats.skipped), 'yellow')}/` +
        `${colorize(formatNumber(phaseStats.errors), phaseStats.errors > 0 ? 'red' : 'green')}`
      );
    }

    // Errors
    if (report.errors.length > 0) {
      console.log(`\n${colorize('Errors:', 'red')}`);
      for (const error of report.errors.slice(0, 20)) {
        console.log(`  ${colorize('✗', 'red')} [${error.phase}] ${error.message}`);
        if (error.field) {
          console.log(`    ${colorize('Field:', 'gray')} ${error.field} ${colorize('Table:', 'gray')} ${error.wpTable} ${colorize('ID:', 'gray')} ${error.wpId}`);
        }
      }
      if (report.errors.length > 20) {
        console.log(`  ${colorize(`... and ${report.errors.length - 20} more errors`, 'gray')}`);
      }
    }

    // Warnings
    if (report.warnings.length > 0) {
      console.log(`\n${colorize('Warnings:', 'yellow')}`);
      for (const warning of report.warnings.slice(0, 10)) {
        console.log(`  ${colorize('⚠', 'yellow')} ${warning}`);
      }
    }

    // Unmapped meta keys
    if (report.unmappedMetaKeys.length > 0) {
      console.log(`\n${colorize('Unmapped Meta Keys (review manually):', 'yellow')}`);
      console.log(`  ${report.unmappedMetaKeys.slice(0, 30).join(', ')}`);
      if (report.unmappedMetaKeys.length > 30) {
        console.log(`  ${colorize(`... and ${report.unmappedMetaKeys.length - 30} more`, 'gray')}`);
      }
    }

    console.log(`\n${colorize('Migration report saved to:', 'cyan')} ${report.config.outputReport ?? 'console'}`);
  }

  /**
   * Print dry-run plan
   */
  printDryRunPlan(phases: MigrationPhase[]): void {
    console.log(`\n${colorize('Dry Run Plan:', 'bold')}`);
    console.log(colorize('─'.repeat(50), 'gray'));

    for (const phase of phases) {
      const icon = PHASE_ICONS[phase] ?? '•';
      console.log(`  ${icon} ${PHASE_LABELS[phase] ?? phase}`);
    }

    console.log(`\n${colorize('Run without --dry-run to execute.', 'yellow')}`);
  }
}

/**
 * Simple progress indicator for non-TTY environments
 */
export class SimpleReporter {
  onPhaseStart(phase: MigrationPhase): void {
    console.log(`[${new Date().toISOString()}] Starting: ${PHASE_LABELS[phase] ?? phase}`);
  }

  onProgress(phase: MigrationPhase, current: number, total: number): void {
    if (total > 0 && current % 100 === 0) {
      console.log(`[${new Date().toISOString()}] ${PHASE_LABELS[phase] ?? phase}: ${current}/${total}`);
    }
  }

  onPhaseComplete(phase: MigrationPhase, stats: PhaseStats): void {
    console.log(
      `[${new Date().toISOString()}] Completed: ${PHASE_LABELS[phase] ?? phase} - ` +
      `Created: ${stats.created}, Updated: ${stats.updated}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`
    );
  }

  onError(error: MigrationError): void {
    console.error(`[${new Date().toISOString()}] ERROR: ${error.message}`);
  }

  printReport(report: MigrationReport): void {
    console.log('\n=== Migration Report ===');
    console.log(`Total Created: ${report.totals.created}`);
    console.log(`Total Updated: ${report.totals.updated}`);
    console.log(`Total Skipped: ${report.totals.skipped}`);
    console.log(`Total Errors: ${report.totals.errors}`);
    console.log(`Duration: ${report.totals.durationMs}ms`);
  }
}