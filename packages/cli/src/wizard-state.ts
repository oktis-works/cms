// @oktis-works/cms - Wizard: sondagem de estado do projeto
//
// Checagem leve e SOMENTE LEITURA que roda no boot do wizard (e no "Refresh")
// pra adaptar o menu: banner de próximo passo lógico, itens indisponíveis e
// pré-checagens dos fluxos de deploy. Nada aqui cria arquivo, container ou
// processo — o pior caso é o wizard demorar ~200ms no boot.
//
// Tudo que depende de ambiente externo (docker, processos) vem injetado, então
// os testes nunca tocam docker de verdade.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ENV_FIELDS } from './env-schema.js';
import { loadEnvFile } from './env-file.js';
import { statusAll } from './runtime-state.js';
import { defaultRunner, dockerAvailable, inspectContainer, type Runner } from './docker.js';

export interface WizardStateDeps {
  cwd: string;
  runner?: Runner;
  /** Sobrescreve a leitura de processos (testes). */
  appsFn?: (cwd: string) => Array<{ label: string; alive: boolean }>;
}

export interface WizardState {
  /** há okcms.config.json ou .env — "é um projeto OkCMS". */
  isProject: boolean;
  /** todas as variáveis obrigatórias do schema têm valor. */
  envComplete: boolean;
  /** quantas obrigatórias faltam (0 quando completo). */
  envMissing: number;
  dockerUp: boolean;
  infraRunning: boolean;
  appsRunning: boolean;
  appsLabels: string[];
}

export type Suggestion = 'init' | 'env' | 'infra' | 'apps' | 'deploy' | 'none';

export function probeState(deps: WizardStateDeps): WizardState {
  const { cwd } = deps;
  const runner = deps.runner ?? defaultRunner;
  const appsFn = deps.appsFn ?? ((dir: string) => statusAll(dir));

  const isProject =
    existsSync(join(cwd, 'okcms.config.json')) || existsSync(join(cwd, '.env'));

  let envComplete = false;
  let envMissing = ENV_FIELDS.filter((field) => field.required === true).length;
  if (isProject) {
    const record = loadEnvFile(join(cwd, '.env')).toRecord();
    const missing = ENV_FIELDS.filter((field) => {
      if (field.required !== true) return false;
      if (field.when && !field.when(record)) return false;
      return !(record[field.key] ?? '').trim().length;
    });
    envMissing = missing.length;
    envComplete = missing.length === 0;
  }

  const dockerUp = dockerAvailable(runner);
  let infraRunning = false;
  if (dockerUp) {
    const postgres = inspectContainer(runner, 'okcms-postgres');
    const redis = inspectContainer(runner, 'okcms-redis');
    infraRunning = postgres.running || redis.running;
  }

  const apps = isProject ? appsFn(cwd) : [];
  const aliveApps = apps.filter((app) => app.alive);

  return {
    isProject,
    envComplete,
    envMissing,
    dockerUp,
    infraRunning,
    appsRunning: aliveApps.length > 0,
    appsLabels: aliveApps.map((app) => app.label),
  };
}

/**
 * Próximo passo lógico — ordem de importância: projeto novo → env incompleto →
 * infra parada → apps parados → pronto pra deploy.
 */
export function suggestNext(state: WizardState): Suggestion {
  if (!state.isProject) return 'init';
  if (!state.envComplete) return 'env';
  if (state.dockerUp && !state.infraRunning) return 'infra';
  if (!state.appsRunning) return 'apps';
  return state.infraRunning ? 'deploy' : 'none';
}
