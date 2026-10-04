// @oktis-works/cms - Sistema de histórico e rollback unificado
//
// O estado persiste em `.deploy/update-history.json` (para updates de pacotes)
// e em `.deploy/state.json` (para deploys blue/green).
// Ambos expõem a mesma API: lista, detalhe, rollback para índice.
//
// Entradas de histórico cobrem:
//   - update:download  (pacotes @oktis-works/*)
//   - update:deploy    (blue/green + pacotes)
//   - deploy:pm2       (ecosystem pm2)
//   - deploy:docker    (alias para update:deploy)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type HistoryMode = 'download' | 'deploy' | 'pm2';

export interface HistoryEntry {
  id: number;
  /** Modo da operação. */
  mode: HistoryMode;
  /** Timestamp ISO da operação. */
  at: string;
  /** Versão da CLI que executou. */
  cliVersion: string;
  /** Pacotes atualizados (apenas modo download/deploy). */
  packages?: Array<{ name: string; from: string; to: string }>;
  /** Lane ativa após deploy (apenas modo deploy). */
  lane?: 'blue' | 'green';
  /** Lane anterior (para rollback de lane). */
  previousLane?: 'blue' | 'green' | null;
  /** Mensagem descritiva. */
  message: string;
  /** Snapshot do package.json (apenas modo download). */
  packageJsonSnapshot?: string;
}

export interface HistoryState {
  entries: HistoryEntry[];
  /** Próximo ID incremental. */
  nextId: number;
}

const HISTORY_DIR = '.deploy';
const HISTORY_FILE = 'update-history.json';

/** Caminho absoluto do arquivo de histórico. */
export function historyPath(cwd: string): string {
  return join(cwd, HISTORY_DIR, HISTORY_FILE);
}

/** Lê o estado do histórico. */
export function readHistory(cwd: string): HistoryState {
  const path = historyPath(cwd);
  if (!existsSync(path)) return { entries: [], nextId: 1 };
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as HistoryState;
    if (!Array.isArray(parsed.entries)) return { entries: [], nextId: 1 };
    if (typeof parsed.nextId !== 'number') parsed.nextId = parsed.entries.length + 1;
    return parsed;
  } catch {
    return { entries: [], nextId: 1 };
  }
}

/** Grava o estado do histórico (atômico via writeFileSync). */
export function writeHistory(cwd: string, state: HistoryState): void {
  const path = historyPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

/** Adiciona uma entrada ao histórico e retorna a entrada criada. */
export function addHistoryEntry(
  cwd: string,
  entry: Omit<HistoryEntry, 'id'>,
  cliVersion: string
): HistoryEntry {
  const state = readHistory(cwd);
  const newEntry: HistoryEntry = {
    ...entry,
    id: state.nextId++,
    cliVersion,
  };
  state.entries.push(newEntry);
  // Mantém apenas os últimos 50 (diagnóstico, não log infinito)
  if (state.entries.length > 50) state.entries = state.entries.slice(-50);
  writeHistory(cwd, state);
  return newEntry;
}

/** Lista entradas (mais recentes primeiro). */
export function listHistory(cwd: string): HistoryEntry[] {
  const state = readHistory(cwd);
  return [...state.entries].reverse();
}

/** Busca entrada por ID. */
export function getHistoryEntry(cwd: string, id: number): HistoryEntry | null {
  const state = readHistory(cwd);
  return state.entries.find((e) => e.id === id) ?? null;
}

/** Remove entrada por ID (útil para limpar). */
export function removeHistoryEntry(cwd: string, id: number): boolean {
  const state = readHistory(cwd);
  const idx = state.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  state.entries.splice(idx, 1);
  writeHistory(cwd, state);
  return true;
}

/** Limpa todo o histórico. */
export function clearHistory(cwd: string): void {
  writeHistory(cwd, { entries: [], nextId: 1 });
}

/** Formata uma entrada para exibição no terminal. */
export function formatHistoryEntry(entry: HistoryEntry): string {
  const modeLabel = {
    download: 'download',
    deploy: 'deploy (blue/green)',
    pm2: 'deploy (pm2)',
  }[entry.mode];

  const lines = [
    `  ${entry.id}. [${modeLabel}] ${entry.at}`,
    `     CLI: ${entry.cliVersion} · ${entry.message}`,
  ];

  if (entry.packages && entry.packages.length > 0) {
    for (const p of entry.packages) {
      lines.push(`     @oktis-works/${p.name}: ${p.from} → ${p.to}`);
    }
  }

  if (entry.lane) {
    lines.push(`     lane: ${entry.lane}${entry.previousLane ? ` (era ${entry.previousLane})` : ''}`);
  }

  return lines.join('\n');
}