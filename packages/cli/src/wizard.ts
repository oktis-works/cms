// @oktis-works/cms - Wizard interativo do CLI
//
// `okcms` sem argumentos em TTY abre isto; fora de TTY segue o help estático
// (automazione nunca cai aqui). O wizard é um ORQUESTRADOR: navega, explica e
// executa os mesmos comandos via subprocesso — ele não reimplementa nada.
//
// Três eixos no menu:
//   1. fluxos guiados (init, dev, 3 deploys, update);
//   2. qualquer um dos comandos do CLI, agrupados, destrutivos marcados;
//   3. entrevista de .env campo a campo.
// Mais: status do projeto (sondagem adaptativa), troca de idioma e sair.

import { getCommand, commands, type Command } from './commands.js';
import { commandGroupNames } from './parser.js';
import { Prompt, style, symbol, type PromptIO } from './prompt.js';
import { catalogFor, initialLang, type Catalog, type WizardLang } from './wizard-i18n.js';
import { probeState, suggestNext, type WizardState, type Suggestion } from './wizard-state.js';
import { runEnvInterview } from './wizard-env.js';
import { runCliCommand, formatCommand, type SpawnFn } from './wizard-run.js';
import {
  flowDeployBlueGreen,
  flowDeployPm2,
  flowDeploySimple,
  flowDev,
  flowInit,
  flowUpdate,
  type FlowDeps,
  type FlowOutcome,
} from './wizard-flows.js';

export interface WizardOptions {
  cwd?: string;
  io?: Partial<PromptIO>;
  lang?: WizardLang;
  spawn?: SpawnFn;
  /** Sonda de estado injetável (testes nunca tocam docker). */
  stateFn?: () => WizardState;
}

/**
 * Comandos destrutivos: exigem confirmação EXTRA (com o texto do perigo) antes
 * de rodar. A lista é por NOME de comando — o wizard marca no catálogo e
 * confirma duas vezes antes do spawn.
 */
const DANGEROUS = new Set(['db:restore', 'db:rollback', 'rollback', 'update']);

/** Comandos que só rodam com projeto OkCMS no cwd — avisamos antes. */
const NEEDS_PROJECT = new Set([
  'start', 'stop', 'status', 'dev', 'config', 'update', 'redeploy', 'deploy',
  'rollback', 'db:migrate', 'db:rollback', 'db:status', 'db:backup', 'db:restore',
  'seed', 'user:create', 'plugin:install', 'plugin:list', 'plugin:manage',
  'theme:install', 'theme:list', 'theme:manage', 'theme:build', 'build',
  'prerender', 'media:migrate', 'system:status',
]);

/** Comandos que bloqueiam por longo tempo (Ctrl+C volta ao wizard). */
const LONG_RUNNING = new Set(['dev', 'start', 'init', 'update', 'redeploy', 'deploy']);

type MenuChoice =
  | 'flows' | 'command' | 'env' | 'status' | 'refresh' | 'exit'
  | 'lang';

export async function runWizard(opts: WizardOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const lang = opts.lang ?? initialLang(cwd);
  const prompt = new Prompt(opts.io);

  // o wizard só existe com TTY de verdade — sem terminal não há setas nem
  // entrevista; quem chamou isto por engano recebe o help e sai
  if (!prompt.interactive) {
    prompt.close();
    const { generateHelp } = await import('./parser.js');
    console.log(generateHelp());
    return 0;
  }

  const stateFn = opts.stateFn ?? (() => probeState({ cwd }));
  const ctx: WizardRunCtx = {
    prompt,
    cwd,
    spawn: opts.spawn,
    lang,
    stateFn,
  };

  try {
    for (;;) {
      const catalog = catalogFor(ctx.lang);
      const state = stateFn();
      const suggestion = suggestNext(state);

      printBanner(prompt, catalog, ctx.lang, suggestion, state);

      const choice = await prompt.select<MenuChoice>(catalog.title, mainMenu(catalog, state));

      switch (choice) {
        case 'flows': {
          await flowsMenu(ctx);
          break;
        }
        case 'command': {
          await catalogMenu(ctx);
          break;
        }
        case 'env': {
          await envMenu(ctx);
          break;
        }
        case 'status': {
          printStatus(catalog, stateFn());
          break;
        }
        case 'refresh': {
          prompt.success(catalog.statusRefreshed);
          break;
        }
        case 'lang': {
          ctx.lang = await prompt.select<WizardLang>(catalog.languageHeading, [
            { value: 'en', label: 'English' },
            { value: 'pt', label: 'Português (Brasil)' },
          ]);
          break;
        }
        case 'exit': {
          prompt.write(`\n  ${style.dim(catalog.bye)}\n\n`);
          return 0;
        }
      }
    }
  } finally {
    prompt.close();
  }
}

interface WizardRunCtx {
  prompt: Prompt;
  cwd: string;
  spawn?: SpawnFn;
  lang: WizardLang;
  stateFn: () => WizardState;
}

function printBanner(
  prompt: Prompt,
  catalog: Catalog,
  lang: WizardLang,
  suggestion: Suggestion,
  state: WizardState
): void {
  prompt.write(`\n${style.bold(`  ◈ ${catalog.title}`)}  ${style.dim(`· ${catalog.langLabel(lang)}`)}\n`);
  const tip = suggestionTip(catalog, suggestion);
  if (tip) prompt.write(`    ${style.cyan(symbol.arrow)} ${style.dim(tip)}\n`);
  if (!state.isProject) prompt.warn(catalog.statusNoProject);
}

function suggestionTip(catalog: Catalog, suggestion: Suggestion): string {
  switch (suggestion) {
    case 'init': return catalog.suggestInit;
    case 'env': return catalog.suggestEnv;
    case 'infra': return catalog.suggestInfra;
    case 'apps': return catalog.suggestApps;
    case 'deploy': return catalog.suggestDeploy;
    default: return catalog.suggestNone;
  }
}

function mainMenu(
  catalog: Catalog,
  state: WizardState
): Array<{ value: MenuChoice; label: string; hint: string }> {
  return [
    { value: 'flows', label: catalog.menuFlows, hint: catalog.menuFlowsHint },
    {
      value: 'command',
      label: catalog.menuCommand,
      hint: catalog.menuCommandHint.replace('{n}', String(wizardCommandCount())),
    },
    { value: 'env', label: catalog.menuEnv, hint: state.isProject ? catalog.menuEnvHint : catalog.envNoProject },
    { value: 'status', label: catalog.menuStatus, hint: catalog.menuStatusHint },
    { value: 'lang', label: catalog.languageHeading, hint: `en / pt` },
    { value: 'refresh', label: catalog.menuRefresh, hint: catalog.menuRefreshHint },
    { value: 'exit', label: catalog.menuExit, hint: catalog.menuExitHint },
  ];
}

function printStatus(catalog: Catalog, state: WizardState): void {
  promptHeadingOnly(catalog.statusHeading);
  if (!state.isProject) {
    console.log(`  ${symbol.fail} ${catalog.statusNoProject}`);
    return;
  }
  console.log(
    `  ${symbol.arrow} ${state.envComplete ? catalog.statusEnvComplete : catalog.statusEnvIncomplete(state.envMissing)}`
  );
  console.log(`  ${symbol.arrow} ${state.dockerUp ? catalog.statusDockerUp : catalog.statusDockerDown}`);
  console.log(`  ${symbol.arrow} ${state.infraRunning ? catalog.statusInfraUp : catalog.statusInfraDown}`);
  console.log(
    `  ${symbol.arrow} ${state.appsRunning ? catalog.statusAppsUp(state.appsLabels.join(', ')) : catalog.statusAppsDown}`
  );
}

function promptHeadingOnly(text: string): void {
  console.log(`\n${style.bold(text)}`);
}

// ---------------------------------------------------------------------------
// Fluxos guiados
// ---------------------------------------------------------------------------

async function flowsMenu(ctx: WizardRunCtx): Promise<void> {
  const catalog = catalogFor(ctx.lang);
  const deps: FlowDeps = {
    prompt: ctx.prompt,
    catalog,
    cwd: ctx.cwd,
    spawn: ctx.spawn,
    stateFn: ctx.stateFn,
  };

  type FlowKey = 'init' | 'dev' | 'bg' | 'simple' | 'pm2' | 'update' | 'back';
  const pick = await ctx.prompt.select<FlowKey>(catalog.flowsHeading, [
    { value: 'dev', label: catalog.flowDev, hint: catalog.flowDevHint },
    { value: 'bg', label: catalog.flowDeployBg, hint: catalog.flowDeployBgHint },
    { value: 'simple', label: catalog.flowDeploySimple, hint: catalog.flowDeploySimpleHint },
    { value: 'pm2', label: catalog.flowDeployPm2, hint: catalog.flowDeployPm2Hint },
    { value: 'update', label: catalog.flowUpdate, hint: catalog.flowUpdateHint },
    { value: 'init', label: catalog.flowInit, hint: catalog.flowInitHint },
    { value: 'back', label: catalog.flowBack, hint: catalog.flowBackHint },
  ]);

  const runners: Record<Exclude<FlowKey, 'back'>, (deps: FlowDeps) => Promise<FlowOutcome>> = {
    init: flowInit,
    dev: flowDev,
    bg: flowDeployBlueGreen,
    simple: flowDeploySimple,
    pm2: flowDeployPm2,
    update: flowUpdate,
  };

  if (pick === 'back') return;
  await runners[pick](deps);
}

// ---------------------------------------------------------------------------
// Catálogo de comandos (rodar qualquer um interativamente)
// ---------------------------------------------------------------------------

async function catalogMenu(ctx: WizardRunCtx): Promise<void> {
  const prompt = ctx.prompt;
  const catalog = catalogFor(ctx.lang);

  prompt.heading(catalog.catalogHeading);
  prompt.info(catalog.catalogIntro);

  const groups = commandGroupNames();
  type Entry = { value: string; label: string; hint: string };
  const groupChoices: Entry[] = groups.map(([group]) => ({
    value: `group:${group}`,
    label: group,
    hint: `${groupCommands(group).length} commands`,
  }));
  groupChoices.push({ value: 'back', label: catalog.flowBack, hint: catalog.flowBackHint });

  const groupPick = await prompt.select<string>(catalog.catalogPickCommand, groupChoices);
  if (groupPick === 'back') return;

  const group = groupPick.slice('group:'.length);
  const names = groupCommands(group);
  const commandChoices: Entry[] = names.map((name) => {
    const cmd = getCommand(name)!;
    const danger = DANGEROUS.has(name) ? ` ${symbol.warn}` : '';
    return { value: name, label: `${name}${danger}`, hint: cmd.description };
  });
  commandChoices.push({ value: 'back', label: catalog.flowBack, hint: catalog.flowBackHint });

  const namePick = await prompt.select<string>(`${group}`, commandChoices);
  if (namePick === 'back') return;

  await runCommandInteractive(ctx, getCommand(namePick)!);
}

function groupCommands(group: string): string[] {
  const entry = commandGroupNames().find(([name]) => name === group);
  return entry ? entry[1] : [];
}

/** Pergunta as opções obrigatórias (e opcionais, se pedidas) e executa. */
async function runCommandInteractive(ctx: WizardRunCtx, cmd: Command): Promise<void> {
  const prompt = ctx.prompt;
  const catalog = catalogFor(ctx.lang);
  const dangerous = DANGEROUS.has(cmd.name);

  prompt.heading(dangerous ? catalog.catalogDanger(cmd.name) : `okcms ${cmd.name}`);
  prompt.info(cmd.description);

  if (NEEDS_PROJECT.has(cmd.name)) {
    const state = ctx.stateFn();
    if (!state.isProject) prompt.warn(catalog.warnNoProject);
  }

  const flags: Array<[string, string]> = [];

  for (const option of cmd.options) {
    if (!option.required) continue;
    const label = catalog.catalogRequired(`--${option.name}`, option.description);
    const secretLike = /password|secret/i.test(option.name);
    let value: string;
    if (secretLike) {
      value = await prompt.secret(label, { default: option.default });
    } else {
      value = await prompt.ask(label, {
        default: option.default,
        placeholder: option.default ? `${option.default} (default)` : undefined,
      });
    }
    if (value) flags.push([option.name, value]);
  }

  const optionals = cmd.options.filter((option) => !option.required);
  if (optionals.length > 0) {
    const add = await prompt.confirm(catalog.catalogAddOptionals, { defaultValue: false });
    if (add) {
      for (;;) {
        const pick = await prompt.select<string>(catalog.catalogPickOptional, [
          ...optionals.map((option) => ({
            value: option.name,
            label: `--${option.name}`,
            hint: option.description,
          })),
          { value: '__run', label: '▶ ' + symbol.arrow + ' run', hint: catalog.catalogDone },
        ]);
        if (pick === '__run') break;
        const option = optionals.find((candidate) => candidate.name === pick)!;
        const value = await prompt.ask(catalog.catalogValueFor(`--${option.name}`, option.description), {
          default: option.default ?? 'true',
        });
        flags.push([option.name, value || 'true']);
      }
    }
  }

  const line = formatCommand(cmd.name, flags);

  if (dangerous) {
    const ok = await prompt.confirm(catalog.catalogConfirmDanger(line), { defaultValue: false });
    if (!ok) {
      prompt.warn(catalog.stepCancelled);
      return;
    }
  } else if (!(await prompt.confirm(catalog.catalogConfirmRun(line), { defaultValue: true }))) {
    prompt.warn(catalog.stepCancelled);
    return;
  }

  await runCliCommand(cmd.name, flags, {
    prompt,
    spawn: ctx.spawn,
    cwd: ctx.cwd,
    longRunning: LONG_RUNNING.has(cmd.name),
  });
}

// ---------------------------------------------------------------------------
// Entrevista de env como item de menu
// ---------------------------------------------------------------------------

async function envMenu(ctx: WizardRunCtx): Promise<void> {
  const catalog = catalogFor(ctx.lang);
  const state = ctx.stateFn();
  if (!state.isProject) {
    ctx.prompt.warn(catalog.envNoProject);
    return;
  }
  await runEnvInterview({ prompt: ctx.prompt, catalog, cwd: ctx.cwd });
}

/** Total de comandos registrados (usado pelo banner de documentação). */
export const wizardCommandCount = (): number => commands.length;
