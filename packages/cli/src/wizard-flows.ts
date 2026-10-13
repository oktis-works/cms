// @oktis-works/cms - Wizard: fluxos guiados
//
// Seis trilhas passo-a-passo que ENCADEIAM os comandos reais via subprocesso:
// nada é reimplementado aqui — o wizard explica, pergunta, imprime a linha de
// automação e executa o mesmo `okcms ...` que você rodaria à mão.
//
// Padrão comum de todos os fluxos:
//   intro → entrevista de env (pulável, dev/deploys) → pré-checagens →
//   confirmação → execução (espelho + subprocesso) → em falha: doctor/retry/menu
//
// Comandos longos (dev/start) são marcados como `longRunning`: o Ctrl+C neles
// retorna ao wizard em vez de encerrar a sessão.

import { probeState, type WizardState } from './wizard-state.js';
import { runEnvInterview } from './wizard-env.js';
import { runCliCommand, type RunResult, type SpawnFn } from './wizard-run.js';
import { type Prompt } from './prompt.js';
import type { Catalog } from './wizard-i18n.js';

const ESC = '\x1b[';

/** Limpa a tela e posiciona o cursor no topo. */
function clearScreen(prompt: Prompt): void {
  prompt.write(`${ESC}2J${ESC}H`);
}

export interface FlowDeps {
  prompt: Prompt;
  catalog: Catalog;
  cwd: string;
  spawn?: SpawnFn;
  stateFn?: () => WizardState;
}

export type FlowOutcome = 'done' | 'cancelled' | 'failed';

const stateOf = (deps: FlowDeps): WizardState =>
  deps.stateFn ? deps.stateFn() : probeState({ cwd: deps.cwd });

/** Entrevista de env comum aos fluxos dev/deploys (pulável). */
async function envStep(deps: FlowDeps): Promise<boolean> {
  clearScreen(deps.prompt);
  const result = await runEnvInterview(
    { prompt: deps.prompt, catalog: deps.catalog, cwd: deps.cwd },
    { skipOption: true }
  );
  if (result.status === 'cancelled') {
    deps.prompt.warn(deps.catalog.stepCancelled);
    return false;
  }
  if (result.status === 'nothing') deps.prompt.info(deps.catalog.stepEnvSkip);
  return true;
}

/** Pré-checagem dos deploys: apps locais seguram as portas dos containers. */
async function precheckDeploy(deps: FlowDeps): Promise<boolean> {
  clearScreen(deps.prompt);
  const state = stateOf(deps);
  if (!state.isProject) {
    deps.prompt.error(deps.catalog.warnNoProject);
    return false;
  }
  if (!state.dockerUp) {
    deps.prompt.error(deps.catalog.statusDockerDown);
    return false;
  }
  if (state.appsRunning) {
    deps.prompt.warn(deps.catalog.stepAppsRunning);
    const stop = await deps.prompt.confirm(deps.catalog.stepStopFirst, { defaultValue: true });
    if (!stop) {
      deps.prompt.warn(deps.catalog.stepCancelled);
      return false;
    }
    const result = await runCliCommand(
      'stop',
      [],
      { prompt: deps.prompt, spawn: deps.spawn, cwd: deps.cwd }
    );
    if (result.code !== 0) return false;
  }
  deps.prompt.info(deps.catalog.stepPrecheck + ': ' + deps.catalog.statusInfraUp);
  return true;
}

/** Em falha: doctor / retry / menu. Retorna 'retry' para repetir o passo. */
async function failureMenu(deps: FlowDeps, retry: () => Promise<RunResult>): Promise<FlowOutcome> {
  for (;;) {
    clearScreen(deps.prompt);
    const pick = await deps.prompt.select<'doctor' | 'retry' | 'menu'>(deps.catalog.onFailure, [
      { value: 'doctor', label: deps.catalog.failDoctor },
      { value: 'retry', label: deps.catalog.failRetry },
      { value: 'menu', label: deps.catalog.failMenu },
    ]);
    if (pick === 'menu') return 'failed';
    if (pick === 'doctor') {
      await runCliCommand('doctor', [], { prompt: deps.prompt, spawn: deps.spawn, cwd: deps.cwd });
      continue;
    }
    const result = await retry();
    if (result.code === 0) return 'done';
  }
}

async function confirmRun(deps: FlowDeps, line: string): Promise<boolean> {
  return deps.prompt.confirm(deps.catalog.stepConfirmRun(line), { defaultValue: true });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function flowInit(deps: FlowDeps): Promise<FlowOutcome> {
  const { prompt, catalog } = deps;
  clearScreen(prompt);
  prompt.heading(catalog.stepIntro(catalog.flowInit));
  prompt.info(catalog.initWhatItDoes);

  const dir = await prompt.ask('Project directory', { default: '.' });
  const lang = await prompt.select<'en' | 'pt'>('Docs language', [
    { value: 'en', label: 'English', hint: 'default' },
    { value: 'pt', label: 'Português (Brasil)' },
  ]);
  const install = await prompt.select<boolean>('Install dependencies now?', [
    { value: true, label: 'Yes', hint: 'recommended' },
    { value: false, label: 'No' },
  ]);

  const flags: Array<[string, string]> = [['lang', lang]];
  if (!install) flags.push(['no-install', 'true']);
  const run = (): Promise<RunResult> =>
    runCliCommand('init', flags, {
      prompt,
      spawn: deps.spawn,
      cwd: deps.cwd,
      positional: [dir],
      longRunning: true,
    });

  if (!(await confirmRun(deps, `okcms init ${dir} --lang ${lang}${install ? '' : ' --no-install'}`))) {
    prompt.warn(catalog.stepCancelled);
    return 'cancelled';
  }

  const result = await run();
  return result.code === 0 ? 'done' : failureMenu(deps, run);
}

// ---------------------------------------------------------------------------
// Dev
// ---------------------------------------------------------------------------

export async function flowDev(deps: FlowDeps): Promise<FlowOutcome> {
  const { prompt, catalog } = deps;
  clearScreen(prompt);
  prompt.heading(catalog.stepIntro(catalog.flowDev));
  prompt.info(catalog.devWhatItDoes);

  if (!(await envStep(deps))) return 'cancelled';

  if (!(await confirmRun(deps, 'okcms dev'))) {
    prompt.warn(catalog.stepCancelled);
    return 'cancelled';
  }

  const run = () => runCliCommand('dev', [], { prompt, spawn: deps.spawn, cwd: deps.cwd, longRunning: true });
  const result = await run();
  return result.code === 0 ? 'done' : failureMenu(deps, run);
}

// ---------------------------------------------------------------------------
// Deploys (blue-green / simple / pm2)
// ---------------------------------------------------------------------------

type DeployTarget = 'blue-green' | 'simple' | 'pm2';

async function flowDeploy(deps: FlowDeps, target: DeployTarget, label: string): Promise<FlowOutcome> {
  const { prompt, catalog } = deps;
  clearScreen(prompt);
  prompt.heading(catalog.stepIntro(label));
  prompt.info(catalog.deployTargetSummary(target));

  if (!(await envStep(deps))) return 'cancelled';
  if (!(await precheckDeploy(deps))) return 'cancelled';

  const flags: Array<[string, string]> = [['target', target], ['yes', 'true']];
  const run = () => runCliCommand('deploy', flags, { prompt, spawn: deps.spawn, cwd: deps.cwd });

  if (!(await confirmRun(deps, `okcms deploy --target ${target} --yes`))) {
    prompt.warn(catalog.stepCancelled);
    return 'cancelled';
  }

  const result = await run();
  return result.code === 0 ? 'done' : failureMenu(deps, run);
}

export const flowDeployBlueGreen = (deps: FlowDeps): Promise<FlowOutcome> =>
  flowDeploy(deps, 'blue-green', deps.catalog.flowDeployBg);

export const flowDeploySimple = (deps: FlowDeps): Promise<FlowOutcome> =>
  flowDeploy(deps, 'simple', deps.catalog.flowDeploySimple);

export const flowDeployPm2 = (deps: FlowDeps): Promise<FlowOutcome> =>
  flowDeploy(deps, 'pm2', deps.catalog.flowDeployPm2);

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function flowUpdate(deps: FlowDeps): Promise<FlowOutcome> {
  const { prompt, catalog } = deps;
  const state = stateOf(deps);
  clearScreen(prompt);
  prompt.heading(catalog.stepIntro(catalog.flowUpdate));
  prompt.info(catalog.updateSummary);

  if (!state.isProject) {
    prompt.error(catalog.warnNoProject);
    return 'cancelled';
  }

  if (!(await confirmRun(deps, 'okcms update'))) {
    prompt.warn(catalog.stepCancelled);
    return 'cancelled';
  }

  const run = () => runCliCommand('update', [], { prompt, spawn: deps.spawn, cwd: deps.cwd, longRunning: true });
  const result = await run();
  return result.code === 0 ? 'done' : failureMenu(deps, run);
}
