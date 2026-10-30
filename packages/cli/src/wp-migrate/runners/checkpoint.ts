/**
 * Checkpoint Management
 * Handles saving/loading migration checkpoints for resume capability
 */

import { MigrationCheckpoint, IDMaps, PhaseStats } from '../types';
import { promises as fs } from 'fs';
import { join } from 'path';

const CHECKPOINT_DIR = '.wp-migration-checkpoints';

export interface CheckpointManager {
  save(checkpoint: MigrationCheckpoint): Promise<void>;
  load(tenantSlug: string, phase: string): Promise<MigrationCheckpoint | null>;
  list(tenantSlug: string): Promise<string[]>;
  delete(tenantSlug: string, phase: string): Promise<void>;
  clear(tenantSlug: string): Promise<void>;
}

export function createCheckpointManager(baseDir: string = process.cwd()): CheckpointManager {
  const checkpointDir = join(baseDir, CHECKPOINT_DIR);

  return {
    async save(checkpoint: MigrationCheckpoint): Promise<void> {
      await fs.mkdir(checkpointDir, { recursive: true });
      const fileName = `${checkpoint.phase}-${Date.now()}.json`;
      const filePath = join(checkpointDir, fileName);
      await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
    },

    async load(tenantSlug: string, phase: string): Promise<MigrationCheckpoint | null> {
      try {
        const files = await fs.readdir(checkpointDir);
        const phaseFiles = files
          .filter(f => f.startsWith(`${phase}-`) && f.endsWith('.json'))
          .sort()
          .reverse();

        if (phaseFiles.length === 0) return null;

        const latest = phaseFiles[0];
        if (!latest) return null;
        const content = await fs.readFile(join(checkpointDir, latest), 'utf-8');
        return JSON.parse(content) as MigrationCheckpoint;
      } catch {
        return null;
      }
    },

    async list(_tenantSlug: string): Promise<string[]> {
      try {
        const files = await fs.readdir(checkpointDir);
        return files.filter(f => f.endsWith('.json')).sort();
      } catch {
        return [];
      }
    },

    async delete(_tenantSlug: string, phase: string): Promise<void> {
      try {
        const files = await fs.readdir(checkpointDir);
        const phaseFiles = files.filter(f => f.startsWith(`${phase}-`));
        for (const file of phaseFiles) {
          await fs.unlink(join(checkpointDir, file));
        }
      } catch {
        // Ignore
      }
    },

    async clear(_tenantSlug: string): Promise<void> {
      try {
        const files = await fs.readdir(checkpointDir);
        for (const file of files) {
          await fs.unlink(join(checkpointDir, file));
        }
      } catch {
        // Ignore
      }
    },
  };
}

/**
 * Create a checkpoint from current migration state
 */
export function createCheckpoint(
  phase: string,
  stats: Record<string, PhaseStats>,
  idMaps: IDMaps
): MigrationCheckpoint {
  return {
    phase: phase as MigrationCheckpoint['phase'],
    completedAt: new Date().toISOString(),
    stats: stats[phase] ?? { created: 0, updated: 0, skipped: 0, errors: 0, durationMs: 0 },
    idMaps: {
      user: new Map(idMaps.user),
      content: new Map(idMaps.content),
      term: new Map(idMaps.term),
      taxonomy: new Map(idMaps.taxonomy),
      media: new Map(idMaps.media),
      comment: new Map(idMaps.comment),
      menu: new Map(idMaps.menu),
      menuItem: new Map(idMaps.menuItem),
    },
  };
}

/**
 * Restore migration state from checkpoint
 */
export function restoreFromCheckpoint(
  checkpoint: MigrationCheckpoint,
  stats: Record<string, PhaseStats>,
  idMaps: IDMaps
): void {
  // Restore stats for completed phase
  stats[checkpoint.phase] = checkpoint.stats;

  // Restore ID maps
  idMaps.user = new Map(checkpoint.idMaps.user);
  idMaps.content = new Map(checkpoint.idMaps.content);
  idMaps.term = new Map(checkpoint.idMaps.term);
  idMaps.taxonomy = new Map(checkpoint.idMaps.taxonomy);
  idMaps.media = new Map(checkpoint.idMaps.media);
  idMaps.comment = new Map(checkpoint.idMaps.comment);
  idMaps.menu = new Map(checkpoint.idMaps.menu);
  idMaps.menuItem = new Map(checkpoint.idMaps.menuItem);
}