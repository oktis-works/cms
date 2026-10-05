// @oktis-works/cms - `okcms deploy` (first deploy, unified)
//
// Picks the target with arrow keys, then runs it:
//
//   blue/green   build → migrations → healthcheck → proxy swap → worker drain
//   simple       one stack (docker-compose.app.yml) → proxy points at it
//   pm2          processes on the host, no docker build
//
// The choice is remembered in `.deploy/state.json`, so the next `deploy`,
// `update` or `redeploy` opens with it pre-selected.
//
// Deliberately NO cache/orphan knobs here: this is the FIRST deploy — a plain
// layered build is what you want, and there is no previous lane to clean up.
// Those options live in `okcms redeploy` (and `okcms update --mode deploy`).

import { Prompt } from './prompt.js';
import { defaultRunner, type Runner } from './docker.js';
import { deployBlueGreen } from './bluegreen.js';
import { deploySimple } from './simple.js';
import { deployPm2 } from './pm2.js';
import { resolveTarget, saveTarget, type DeployTarget } from './deploy-target.js';
import { assertHostOnly, type ContainerProbe } from './guards.js';

export type { DeployTarget } from './deploy-target.js';

export interface DeployOptions {
  cwd?: string;
  /** `--target blue-green|simple|pm2` (skips the menu). */
  target?: string;
  /** `--yes`: no prompts, every choice takes its default. */
  yes?: boolean;
  /** `--force`: allows running inside a container (not recommended). */
  force?: boolean;
  /** `--install`: update packages before a PM2 deploy. */
  install?: boolean;
  probe?: ContainerProbe;
  runner?: Runner;
  prompt?: Prompt;
}

export async function runDeploy(opts: DeployOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const prompt = opts.prompt ?? new Prompt();
  const ownsPrompt = opts.prompt === undefined;
  const runner = opts.runner ?? defaultRunner;

  const guard = assertHostOnly('okcms deploy', { force: opts.force, probe: opts.probe });
  if (!guard.ok) {
    console.error(guard.message);
    if (ownsPrompt) prompt.close();
    return 1;
  }

  try {
    // ---- 1. target --------------------------------------------------------
    let target: DeployTarget;
    try {
      target = await resolveTarget({ cwd, target: opts.target, yes: opts.yes }, prompt);
    } catch (error) {
      prompt.error(error instanceof Error ? error.message : String(error));
      return 1;
    }

    // ---- 2. package scan (drives install, summary and history) -----------
    const scan = await scanForDeploy(cwd, prompt);
    const interactive = prompt.interactive && opts.yes !== true;

    if (target === 'pm2') {
      if (interactive) {
        prompt.heading('Deploy — PM2 on the host');
        prompt.info(`${scan.outdated.length} package update(s)`);
        prompt.info('no image build · migrations on the host · pm2 startOrReload');
        const confirmed = await prompt.confirm('Start the deploy?', { defaultValue: true });
        if (!confirmed) {
          prompt.warn('Cancelled.');
          return 0;
        }
      }
      const code = await deployPm2({
        cwd,
        prompt,
        runner,
        outdated: scan.outdated,
        install: opts.install === true,
        yes: opts.yes === true,
      });
      if (code === 0) saveTarget(cwd, 'pm2');
      return code;
    }

    // No node_modules yet (fresh clone) is fine: both Docker targets run
    // `bun install` on the host before anything else that needs it.
    if (interactive) {
      prompt.heading(target === 'simple' ? 'Deploy — simple containers' : 'Deploy — blue/green');
      prompt.info(`${scan.outdated.length} package update(s)`);
      if (target === 'simple') {
        prompt.info('build → migrations → up -d → proxy → healthcheck');
        prompt.info('one stack, brief restart (no second lane)');
      } else {
        prompt.info('build → migrations → healthcheck → proxy swap → worker drain');
        prompt.info('layer cache — no-cache/orphans live in okcms redeploy');
      }
      const confirmed = await prompt.confirm('Start the deploy?', { defaultValue: true });
      if (!confirmed) {
        prompt.warn('Cancelled.');
        return 0;
      }
    }

    // ---- 3. run -----------------------------------------------------------
    if (target === 'simple') {
      const result = await deploySimple({
        cwd,
        runner,
        noCache: false,
        packages: scan.outdated.map((entry) => `${entry.pkg}@latest`),
        installAll: !scan.installed,
        log: (message) => prompt.write(`${message}\n`),
        warn: (message) => prompt.write(`${message}\n`),
      });
      if (!result.ok) return 1;
      saveTarget(cwd, 'simple');
      await recordDeploy(cwd, prompt, scan, 'Simple container deploy');
      return 0;
    }

    const result = await deployBlueGreen({
      cwd,
      runner,
      // First deploy: layered build, and nothing to clean up yet.
      choices: { noCache: false, removeOrphans: true },
      packages: scan.outdated.map((entry) => `${entry.pkg}@latest`),
      installAll: !scan.installed,
      log: (message) => prompt.write(`${message}\n`),
      warn: (message) => prompt.write(`${message}\n`),
    });
    if (!result.ok) return 1;

    saveTarget(cwd, 'blue-green');
    await recordDeploy(
      cwd,
      prompt,
      scan,
      `Blue/green deploy → lane ${result.lane}`,
      result.lane,
      result.previousLane
    );
    return 0;
  } finally {
    if (ownsPrompt) prompt.close();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DeployScan {
  installed: boolean;
  outdated: Array<{ name: string; pkg: string; current: string; latest: string }>;
}

/** Scans `node_modules/@oktis-works/*` against the npm registry. */
async function scanForDeploy(cwd: string, prompt: Prompt): Promise<DeployScan> {
  const { scanOutdated } = await import('./update.js');
  return await scanOutdated(cwd, (message) => prompt.write(`${message}\n`));
}

/** Writes the history entry and refreshes the generated project docs. */
async function recordDeploy(
  cwd: string,
  prompt: Prompt,
  scan: DeployScan,
  message: string,
  lane?: 'blue' | 'green',
  previousLane?: 'blue' | 'green' | null
): Promise<void> {
  const pkg = await import('../package.json', { with: { type: 'json' } });
  const { addHistoryEntry } = await import('./history.js');
  addHistoryEntry(
    cwd,
    {
      mode: 'deploy',
      at: new Date().toISOString(),
      cliVersion: pkg.default.version,
      packages: scan.outdated.map((entry) => ({
        name: entry.name,
        from: entry.current,
        to: entry.latest,
      })),
      lane,
      previousLane,
      message,
    },
    pkg.default.version
  );

  const { updateProjectDocs } = await import('./docs-updater.js');
  const updated = updateProjectDocs(cwd);
  if (updated.length > 0) prompt.success(`Docs updated: ${updated.join(', ')}`);
}
