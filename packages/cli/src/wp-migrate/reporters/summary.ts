/**
 * Summary Reporter
 * Generates human-readable summary report in Markdown format
 */

import { MigrationReport, MigrationPhase } from '../types';
import { promises as fs } from 'fs';
import { join } from 'path';

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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export class SummaryReporter {
  private outputPath: string;

  constructor(outputPath: string) {
    this.outputPath = outputPath;
  }

  /**
   * Generate and write Markdown summary report
   */
  async write(report: MigrationReport): Promise<void> {
    const markdown = this.generateMarkdown(report);
    await fs.mkdir(join(this.outputPath, '..'), { recursive: true });
    await fs.writeFile(this.outputPath, markdown);
  }

  /**
   * Generate Markdown report
   */
  generateMarkdown(report: MigrationReport): string {
    const lines: string[] = [
      '# WordPress Migration Report',
      '',
      `**Tenant:** ${report.config.tenantSlug}`,
      `**WP Database:** ${report.config.host}:${report.config.port}/${report.config.database}`,
      `**WP Prefix:** ${report.config.prefix}`,
      `**Started:** ${new Date(report.startedAt).toLocaleString()}`,
      `**Completed:** ${report.completedAt ? new Date(report.completedAt).toLocaleString() : 'In Progress'}`,
      `**Duration:** ${formatDuration(report.totals.durationMs)}`,
      `**Dry Run:** ${report.config.dryRun ? 'Yes' : 'No'}`,
      '',
      '## Summary',
      '',
      '| Metric | Count |',
      '|--------|-------|',
      `| Created | ${formatNumber(report.totals.created)} |`,
      `| Updated | ${formatNumber(report.totals.updated)} |`,
      `| Skipped | ${formatNumber(report.totals.skipped)} |`,
      `| Errors | ${formatNumber(report.totals.errors)} |`,
      '',
      '## Phase Breakdown',
      '',
      '| Phase | Created | Updated | Skipped | Errors | Duration |',
      '|-------|---------|---------|---------|--------|----------|',
    ];

    for (const [phase, stats] of Object.entries(report.phases)) {
      if (stats.created === 0 && stats.updated === 0 && stats.skipped === 0 && stats.errors === 0) continue;

      lines.push(
        `| ${PHASE_LABELS[phase as MigrationPhase] ?? phase} | ` +
        `${formatNumber(stats.created)} | ` +
        `${formatNumber(stats.updated)} | ` +
        `${formatNumber(stats.skipped)} | ` +
        `${formatNumber(stats.errors)} | ` +
        `${formatDuration(stats.durationMs)} |`
      );
    }

    lines.push('', '## Errors', '');

    if (report.errors.length === 0) {
      lines.push('No errors reported.');
    } else {
      lines.push('| Phase | Table | ID | Field | Message |');
      lines.push('|-------|-------|----|-------|---------|');

      for (const error of report.errors.slice(0, 50)) {
        lines.push(
          `| ${PHASE_LABELS[error.phase] ?? error.phase} | ` +
          `${error.wpTable} | ` +
          `${error.wpId} | ` +
          `${error.field ?? '-'} | ` +
          `${error.message.replace(/\|/g, '\\|')} |`
        );
      }

      if (report.errors.length > 50) {
        lines.push(`| ... | ... | ... | ... | ${report.errors.length - 50} more errors |`);
      }
    }

    if (report.warnings.length > 0) {
      lines.push('', '## Warnings', '');

      for (const warning of report.warnings) {
        lines.push(`- ${warning}`);
      }
    }

    if (report.unmappedMetaKeys.length > 0) {
      lines.push('', '## Unmapped Meta Keys', '');
      lines.push('The following meta keys were not automatically mapped and may require manual review:');
      lines.push('');

      for (const key of report.unmappedMetaKeys.slice(0, 100)) {
        lines.push(`- \`${key}\``);
      }

      if (report.unmappedMetaKeys.length > 100) {
        lines.push(`- ... and ${report.unmappedMetaKeys.length - 100} more`);
      }

      lines.push('');
      lines.push('> **Tip:** Check these keys against your ACF field groups, SEO plugins, and custom plugins. You may need to create custom field definitions or map them to existing fields.');
    }

    lines.push('', '## Next Steps', '');
    lines.push('1. **Verify content** in the OkCMS admin panel');
    lines.push('2. **Review unmapped meta keys** and create field definitions as needed');
    lines.push('3. **Check media files** - if `--copy-files` was not used, configure media storage');
    lines.push('4. **Test permalinks** - URL redirects were generated for slug changes');
    lines.push('5. **Configure SEO** - Yoast/RankMath meta was migrated to `content.metadata.seo`');
    lines.push('6. **Set up menus** - Navigation menus were migrated to OkCMS menu system');

    lines.push('', '---');
    lines.push(`*Report generated by OkCMS WP Migrator on ${new Date().toISOString()}*`);

    return lines.join('\n');
  }
}

/**
 * Generate a quick text summary for CLI output
 */
export function generateTextSummary(report: MigrationReport): string {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '      MIGRATION SUMMARY',
    '═══════════════════════════════════════',
    '',
    `Tenant:          ${report.config.tenantSlug}`,
    `WP Database:     ${report.config.host}:${report.config.port}/${report.config.database}`,
    `Duration:        ${formatDuration(report.totals.durationMs)}`,
    `Dry Run:         ${report.config.dryRun ? 'Yes' : 'No'}`,
    '',
    'Results:',
    `  Created:  ${formatNumber(report.totals.created)}`,
    `  Updated:  ${formatNumber(report.totals.updated)}`,
    `  Skipped:  ${formatNumber(report.totals.skipped)}`,
    `  Errors:   ${formatNumber(report.totals.errors)}`,
    '',
  ];

  if (report.errors.length > 0) {
    lines.push('Errors:');
    for (const error of report.errors.slice(0, 10)) {
      lines.push(`  [${error.phase}] ${error.message}`);
    }
    if (report.errors.length > 10) {
      lines.push(`  ... and ${report.errors.length - 10} more`);
    }
    lines.push('');
  }

  if (report.unmappedMetaKeys.length > 0) {
    lines.push(`Unmapped Meta Keys: ${report.unmappedMetaKeys.length} (see report for details)`);
    lines.push('');
  }

  lines.push('Full report: ' + report.config.outputReport);
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}