// @oktis-works/cms - `okcms update` (F3)
//
// Two paths, one command:
//
//   download  fetches/updates the @oktis-works packages on the host. This is
//             available explicitly with `okcms update --mode download`.
//
//   deploy    runs the application for the chosen target: blue/green lanes,
//             the simple container stack, or PM2 on the host. The CLI always
//             runs on the HOST (see assertHostOnly).
//
// The default path is deploy. In a TTY it ends with an explicit y/n
// confirmation; outside a TTY an implicit deploy requires `--yes`. The
// package-only path remains available through `--mode download`.
//
// History and rollback: every operation writes to `.deploy/update-history.json`
// — `okcms rollback` lists it and can go back.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deployBlueGreen, type DeployChoices } from './bluegreen.js';
import { deploySimple } from './simple.js';
import { deployPm2 } from './pm2.js';
import { resolveTarget, saveTarget, type DeployTarget } from './deploy-target.js';
import { defaultRunner, type Runner } from './docker.js';
import { assertHostOnly, type ContainerProbe } from './guards.js';
import { getLatestVersion } from './npm-registry.js';
import { Prompt, style, symbol } from './prompt.js';
import { addHistoryEntry } from './history.js';
import { updateProjectDocs } from './docs-updater.js';

export type UpdateMode = 'download' | 'deploy';

export interface OutdatedEntry {
  /** short name (`api`), as it appears in node_modules. */
  name: string;
  /** published name (`@oktis-works/api`). */
  pkg: string;
  current: string;
  latest: string;
}

export interface ScanResult {
  /** false = no `node_modules/@oktis-works` (project never installed). */
  installed: boolean;
  outdated: OutdatedEntry[];
}

export interface UpdateOptions {
  cwd?: string;
  /** Legacy `-i/--install` flag. Full updates install packages automatically. */
  install?: boolean;
  /** `--mode download|deploy`; absent = full deploy. */
  mode?: string;
  /** `--target blue-green|simple|pm2` (deploy mode only). */
  target?: string;
  /** `--no-cache`: clean build. */
  noCache?: boolean;
  /** `--remove-orphans` / `--keep-orphans`. */
  removeOrphans?: boolean;
  keepOrphans?: boolean;
  /** `--yes`: no prompts, everything at its default. */
  yes?: boolean;
  /** `--force`: allows running inside a container (not recommended). */
  force?: boolean;
  /** `assertHostOnly` probe (tests); production uses the real detection. */
  probe?: ContainerProbe;
  runner?: Runner;
  prompt?: Prompt;
  log?: (message: string) => void;
}

const MODE_ALIASES: Record<string, UpdateMode> = {
  download: 'download',
  pkg: 'download',
  packages: 'download',
  pacotes: 'download',
  deploy: 'deploy',
  docker: 'deploy',
  bluegreen: 'deploy',
  'blue-green': 'deploy',
  'blue_green': 'deploy',
};

/** `null` = invalid value (different from "not provided"). */
export function parseMode(value: string): UpdateMode | null {
  return MODE_ALIASES[value.trim().toLowerCase()] ?? null;
}

/**
 * Scans `node_modules/@oktis-works/*` and compares each installed version with
 * the registry. A network failure on one package never breaks the scan — it is
 * skipped and the operator sees `?` on the next run.
 */
export async function scanOutdated(
  cwd: string,
  log: (message: string) => void = console.log
): Promise<ScanResult> {
  const nmDir = join(cwd, 'node_modules', '@oktis-works');
  if (!existsSync(nmDir)) return { installed: false, outdated: [] };

  const installed = readdirSync(nmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const outdated: OutdatedEntry[] = [];

  for (const name of installed) {
    let current = '?';
    try {
      const pkgJson = JSON.parse(readFileSync(join(nmDir, name, 'package.json'), 'utf-8')) as {
        version?: string;
      };
      current = pkgJson.version ?? '?';
    } catch {
      // no readable package.json — treated as unknown below
    }

    const latest = await getLatestVersion(`@oktis-works/${name}`);

    if (!latest || latest === current) {
      log(`  ✓ @oktis-works/${name} ${current} (up to date)`);
      continue;
    }

    log(`  ↑ @oktis-works/${name} ${current} → ${latest} available`);
    outdated.push({ name, pkg: `@oktis-works/${name}`, current, latest });
  }

  return { installed: true, outdated };
}

/**
 * Flags > prompt. Outside a TTY the defaults are conservative and
 * deterministic. `removeOrphans` only matters for blue/green — the simple
 * stack and PM2 have no lane to clean up.
 */
export async function resolveDeployChoices(
  opts: Pick<UpdateOptions, 'noCache' | 'removeOrphans' | 'keepOrphans' | 'yes'>,
  prompt: Prompt,
  target: DeployTarget = 'blue-green'
): Promise<DeployChoices> {
  const interactive = prompt.interactive && opts.yes !== true;
  const wantsCache = target !== 'pm2';

  const noCache =
    opts.noCache === true
      ? true
      : interactive && wantsCache
        ? !(await prompt.confirm('Build with layer cache? (no = clean rebuild, slower)', {
            defaultValue: true,
          }))
        : false;

  const removeOrphans =
    target !== 'blue-green'
      ? true
      : opts.keepOrphans === true
        ? false
        : opts.removeOrphans === true
          ? true
          : interactive
            ? await prompt.confirm('Remove orphan containers from the previous lane?', {
                defaultValue: true,
              })
            : true;

  return { noCache, removeOrphans };
}

/** Writes the download history entry + refreshes the generated project docs. */
async function recordUpdateAndDocs(cwd: string, scan: ScanResult): Promise<string[]> {
  const pkg = await import('../package.json', { with: { type: 'json' } });
  const cliVer = pkg.default.version;

  const packages = scan.outdated.map((entry) => ({
    name: entry.name,
    from: entry.current,
    to: entry.latest,
  }));

  addHistoryEntry(
    cwd,
    {
      mode: 'download',
      at: new Date().toISOString(),
      cliVersion: cliVer,
      packages,
      message: `${packages.length} package(s) updated via download`,
    },
    cliVer
  );

  // refresh project docs (README/PLUGIN/THEME) — only rewritten when changed
  return updateProjectDocs(cwd);
}

interface DeployRecord {
  mode: 'deploy' | 'pm2';
  lane?: 'blue' | 'green';
  previousLane?: 'blue' | 'green' | null;
  message: string;
}

/** Writes the deploy history entry + refreshes the generated project docs. */
async function recordDeployAndDocs(
  cwd: string,
  scan: ScanResult,
  record: DeployRecord
): Promise<string[]> {
  const pkg = await import('../package.json', { with: { type: 'json' } });
  const cliVer = pkg.default.version;

  const packages = scan.outdated.map((entry) => ({
    name: entry.name,
    from: entry.current,
    to: entry.latest,
  }));

  addHistoryEntry(
    cwd,
    {
      mode: record.mode,
      at: new Date().toISOString(),
      cliVersion: cliVer,
      packages,
      lane: record.lane,
      previousLane: record.previousLane,
      message: record.message,
    },
    cliVer
  );

  return updateProjectDocs(cwd);
}

export async function runDownload(
  scan: ScanResult,
  opts: UpdateOptions,
  prompt: Prompt
): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.runner ?? defaultRunner;

  if (!scan.installed) {
    console.error('No @oktis-works/* package installed in node_modules.');
    console.error('Run `bun install` (or `okcms init`) before updating.');
    return 1;
  }

  if (scan.outdated.length === 0) {
    prompt.success('All packages are up to date.');
    return 0;
  }

  if (opts.install !== true) {
    prompt.info('Use --install to apply the updates now.');
    prompt.info('Or --mode deploy for a full Docker deploy.');
    return 0;
  }

  prompt.write('\nUpdating...\n');
  const specs = scan.outdated.map((entry) => `${entry.pkg}@latest`);
  const result = runner('bun', ['add', ...specs], {
    cwd,
    inherit: true,
    timeoutMs: 600_000,
  });
  if (result.ok) {
    const updatedDocs = await recordUpdateAndDocs(cwd, scan);
    if (updatedDocs.length > 0) {
      prompt.success(`Project docs updated: ${updatedDocs.join(', ')}`);
    }
    return 0;
  }

  // host without bun: npm does the same job, only slower
  const npm = runner('npm', ['install', ...specs], {
    cwd,
    inherit: true,
    timeoutMs: 600_000,
  });
  if (npm.ok) {
    const updatedDocs = await recordUpdateAndDocs(cwd, scan);
    if (updatedDocs.length > 0) {
      prompt.success(`Project docs updated: ${updatedDocs.join(', ')}`);
    }
    return 0;
  }
  return 1;
}

export async function runUpdate(opts: UpdateOptions = {}): Promise<number> {
  const prompt = opts.prompt ?? new Prompt();
  const ownsPrompt = opts.prompt === undefined;
  const cwd = opts.cwd ?? process.cwd();

  // The deploy/config CLI only exists on the host: inside a container it would
  // become a package installer on the database network, with .env exposed.
  const guard = assertHostOnly('okcms update', { force: opts.force, probe: opts.probe });
  if (!guard.ok) {
    console.error(guard.message);
    if (ownsPrompt) prompt.close();
    return 1;
  }

  const onInterrupt = (): void => {
    prompt.write(
      `\n  ${style.yellow(symbol.warn)} interrupted — no deploy step in progress was recorded.\n`
    );
    process.exit(130);
  };
  process.once('SIGINT', onInterrupt);

  try {
    // ---- 1. mode ----------------------------------------------------------
    let mode: UpdateMode;
    if (opts.mode !== undefined) {
      const parsed = parseMode(opts.mode);
      if (parsed === null) {
        prompt.error(`invalid --mode: ${opts.mode} — use "download" or "deploy"`);
        return 1;
      }
      mode = parsed;
    } else {
      // A normal `okcms update` is a complete update. `-i` is retained as a
      // compatibility alias, but is no longer needed to apply packages.
      mode = 'deploy';
    }

    // ---- 2. deploy target (validated before the scan prints anything) -----
    prompt.heading(`OkCMS update — mode ${mode}`);

    let resolved: DeployTarget | undefined;
    if (mode === 'deploy') {
      try {
        resolved = await resolveTarget({ cwd, target: opts.target, yes: opts.yes }, prompt);
      } catch (error) {
        prompt.error(error instanceof Error ? error.message : String(error));
        return 1;
      }
    }

    // ---- 3. scan ----------------------------------------------------------
    const scan = await scanOutdated(cwd, (message) => prompt.write(`${message}\n`));

    if (mode === 'download') return await runDownload(scan, opts, prompt);

    // A piped command cannot answer the safety question. Explicit deploy mode
    // and --yes are intended for automation; an implicit deploy must stay
    // opt-in instead of changing a production system silently.
    const implicitDeploy = opts.mode === undefined;
    if (implicitDeploy && !prompt.interactive && opts.yes !== true) {
      prompt.warn('interactive confirmation required for the full update.');
      prompt.info('Run `okcms update --yes` in scripts, or use `--mode download` for packages only.');
      return 1;
    }

    const target = resolved as DeployTarget;

    // ---- 4. choices + summary --------------------------------------------
    const choices = await resolveDeployChoices(opts, prompt, target);
    const interactive = prompt.interactive && opts.yes !== true;

    if (interactive) {
      prompt.heading(`Deploy summary — ${target}`);
      prompt.info(`target: ${target === 'blue-green' ? 'blue/green lanes' : target === 'simple' ? 'simple containers' : 'PM2 on the host'}`);
      prompt.info(`packages: ${scan.outdated.length} update(s)`);
      if (target === 'blue-green') {
        prompt.info(`build: ${choices.noCache ? 'no cache (clean rebuild)' : 'layer cache'}`);
        prompt.info(`old lane orphans: ${choices.removeOrphans ? 'remove' : 'keep'}`);
        prompt.info('order: build → host migrations → edge → health → swap → worker → down');
      } else if (target === 'simple') {
        prompt.info('order: build → host migrations → up -d → proxy → healthcheck');
        prompt.info('one stack, brief restart (no second lane)');
      } else {
        prompt.info(`packages on host: ${opts.install === true ? 'update them' : 'leave as they are (--install to update)'}`);
        prompt.info('order: pm2 ecosystem → migrations → startOrReload');
      }
      const confirmed = await prompt.confirm('Start the update?', { defaultValue: true });
      if (!confirmed) {
        prompt.warn('cancelled — nothing was executed.');
        return 0;
      }
    }

    // ---- 5. run -----------------------------------------------------------
    if (target === 'pm2') {
      const code = await deployPm2({
        cwd,
        prompt,
        runner: opts.runner,
        outdated: scan.outdated,
        // an update exists to apply updates; `--install` is implied here
        install: true,
        yes: opts.yes === true,
      });
      if (code === 0) {
        saveTarget(cwd, 'pm2');
        const updatedDocs = await recordDeployAndDocs(cwd, scan, {
          mode: 'pm2',
          message: `PM2 deploy — ${scan.outdated.length} package(s) updated`,
        });
        if (updatedDocs.length > 0) {
          prompt.success(`Project docs updated: ${updatedDocs.join(', ')}`);
        }
      }
      return code;
    }

    if (target === 'simple') {
      const result = await deploySimple({
        cwd,
        runner: opts.runner,
        noCache: choices.noCache,
        packages: scan.outdated.map((entry) => `${entry.pkg}@latest`),
        installAll: !scan.installed,
        log: (message) => prompt.write(`${message}\n`),
        warn: (message) => prompt.write(`${message}\n`),
      });
      if (!result.ok) return 1;
      saveTarget(cwd, 'simple');
      const updatedDocs = await recordDeployAndDocs(cwd, scan, {
        mode: 'deploy',
        message: `Simple container deploy — ${scan.outdated.length} package(s) updated`,
      });
      if (updatedDocs.length > 0) {
        prompt.success(`Project docs updated: ${updatedDocs.join(', ')}`);
      }
      return 0;
    }

    const result = await deployBlueGreen({
      cwd,
      runner: opts.runner,
      choices,
      packages: scan.outdated.map((entry) => `${entry.pkg}@latest`),
      installAll: !scan.installed,
      log: (message) => prompt.write(`${message}\n`),
      warn: (message) => prompt.write(`${message}\n`),
    });

    if (result.ok) {
      saveTarget(cwd, 'blue-green');
      const updatedDocs = await recordDeployAndDocs(cwd, scan, {
        mode: 'deploy',
        lane: result.lane,
        previousLane: result.previousLane,
        message: `Blue/green deploy → lane ${result.lane} (was ${result.previousLane ?? 'n/a'})`,
      });
      if (updatedDocs.length > 0) {
        prompt.success(`Project docs updated: ${updatedDocs.join(', ')}`);
      }
    }

    return result.ok ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    if (ownsPrompt) prompt.close();
  }
}
