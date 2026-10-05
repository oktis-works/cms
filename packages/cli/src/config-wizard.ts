// @oktis-works/cms - Wizard `okcms config` (F1)
//
// Três modos, todos sobre o MESMO catálogo (`env-schema.ts`):
//   · TTY            → wizard seção por seção, com máscara de segredo;
//   · --set K=V      → aplicação pontual validada (CI/scriptIdor);
//   · --list         → leitura segura (segredos mascarados por padrão).
//
// O `.env` é editado in-place pelo `EnvFile`: comentários, seções e ordem do
// arquivo do operador sobrevivem ao wizard. Nada é gravado sem confirmação
// explícita — Ctrl+C no meio descarta.

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EnvFile, loadEnvFile } from './env-file.js';
import {
  ENV_FIELDS,
  ENV_SECTIONS,
  fieldsForSection,
  sectionById,
  validateField,
  type EnvField,
} from './env-schema.js';
import { Prompt, style, symbol, type PromptIO } from './prompt.js';
import { assertHostOnly, generateSecret, looksLikeSecret, redact } from './guards.js';

export interface ConfigWizardOptions {
  /** `KEY=VALUE` com múltiplas entradas separadas por `\n` (parser repetível). */
  set?: string;
  list?: boolean;
  showSecrets?: boolean;
  nonInteractive?: boolean;
  /** Pula direto para uma seção. */
  section?: string;
  force?: boolean;
  cwd?: string;
  /** Prompt injetável (testes / reuso no update). */
  prompt?: Prompt;
  /** IO alternativo quando não se passa um Prompt pronto. */
  io?: Partial<PromptIO>;
}

/** `••••` — nunca o valor real na tela. */
export function maskValue(value: string): string {
  if (!value) return '(not set)';
  const width = Math.min(Math.max(value.length, 4), 12);
  return '•'.repeat(width);
}

/** Valor "apresentável": segredo mascarado, o resto cru. */
export function displayValue(field: EnvField | undefined, value: string): string {
  if (!value) return '(empty)';
  if (field?.type === 'secret') return maskValue(value);
  return value;
}

/** `A=1\nB=2` → pares validos, descartando lixo. */
export function parseSetArgs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.includes('='));
}

function fieldByKey(key: string): EnvField | undefined {
  return ENV_FIELDS.find((field) => field.key === key);
}

interface SetPlan {
  key: string;
  value: string;
  field?: EnvField;
}

/**
 * Valida TODOS os pares antes de aplicar QUALQUER UM — meio gravado com a
 * outra metade inválida deixa o `.env` num estado que ninguém quer.
 */
export function planSet(pairs: string[]): { plan: SetPlan[]; errors: string[] } {
  const plan: SetPlan[] = [];
  const errors: string[] = [];

  for (const pair of pairs) {
    const index = pair.indexOf('=');
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`invalid key: "${key}"`);
      continue;
    }

    const field = fieldByKey(key);
    if (!field) {
      errors.push(
        `unknown key: ${key} — not in the OkCMS catalog. ` +
          `Run \`okcms config --list\` to see the supported ones.`
      );
      continue;
    }

    const problem = validateField(field, value);
    if (problem) {
      errors.push(`${key}: ${problem}`);
      continue;
    }

    plan.push({ key, value, field });
  }

  return { plan, errors };
}

function loadEnv(cwd: string): { env: EnvFile; seeded: boolean; path: string } {
  const path = join(cwd, '.env');
  if (existsSync(path)) return { env: loadEnvFile(path), seeded: false, path };

  // Sem .env: semeia a partir do exemplo para o wizard ter o que mostrar —
  // mas NÃO grava até o operador confirmar.
  const examplePath = join(cwd, '.env.example');
  const seed = existsSync(examplePath) ? readFileSync(examplePath, 'utf-8') : '';
  return { env: new EnvFile(seed, path), seeded: true, path };
}

function printList(env: EnvFile, showSecrets: boolean): void {
  for (const section of ENV_SECTIONS) {
    const fields = fieldsForSection(section.id, env.toRecord());
    if (fields.length === 0) continue;

    console.log(`\n# ${section.title} — ${section.hint}`);
    for (const field of fields) {
      const raw = env.get(field.key) ?? '';
      // segredo só sai cru com --show-secrets explícito
      const shown =
        field.type === 'secret' && !showSecrets ? maskValue(raw) : raw;
      console.log(`${field.key}=${shown}`);
    }
  }
}

export async function runConfigWizard(opts: ConfigWizardOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();

  // 1. A CLI só configura o host — dentro de um container ela exporia o .env.
  const guard = assertHostOnly('okcms config', { force: opts.force });
  if (!guard.ok) {
    console.error(guard.message);
    return 1;
  }

  const { env, seeded, path } = loadEnv(cwd);
  const relPath = relative(cwd, path) || '.env';

  // 2. --set: aplicação pontual validada (fluxo de CI)
  const pairs = parseSetArgs(opts.set);
  if (pairs.length > 0) {
    const { plan, errors } = planSet(pairs);
    if (errors.length > 0) {
      for (const error of errors) console.error(`✗ ${error}`);
      return 1;
    }

    const changed: string[] = [];
    for (const entry of plan) {
      const before = env.get(entry.key) ?? '';
      if (before === entry.value) continue;
      env.set(entry.key, entry.value);
      changed.push(entry.key);
    }

    if (changed.length === 0) {
      console.log('✓ nothing to change — values already match.');
      return 0;
    }

    env.save(path);
    console.log(`✓ ${changed.length} key(s) saved to ${relPath} (permission 600):`);
    for (const key of changed) {
      const field = fieldByKey(key);
      const now = env.get(key) ?? '';
      // segredo nunca aparece em log — só "definido"
      const after = field?.type === 'secret' ? maskValue(now) : now;
      console.log(`  ${symbol.arrow} ${key}=${redact(after)}`);
    }
    return 0;
  }

  // 3. --list / --non-interactive: leitura de máquina. `--non-interactive`
  //    sozinho também cai aqui — sem TTY não há wizard para navegar.
  if (opts.list || opts.nonInteractive) {
    printList(env, opts.showSecrets === true);
    return 0;
  }

  // 4. Sem TTY e sem flag → não há como "navegar"; diz o que fazer.
  const prompt = opts.prompt ?? new Prompt(opts.io);
  if (!opts.prompt && !prompt.interactive && !opts.nonInteractive) {
    prompt.close();
    console.error('okcms config: no terminal — use one of these options:');
    console.error('  okcms config --list              list keys (secrets masked)');
    console.error('  okcms config --set KEY=value     set and validate a key');
    console.error('  okcms config --non-interactive   same output as --list (CI)');
    return 1;
  }

  return runInteractive(prompt, env, { path, relPath, seeded, section: opts.section });
}

interface InteractiveCtx {
  path: string;
  relPath: string;
  seeded: boolean;
  section?: string;
}

async function runInteractive(
  prompt: Prompt,
  env: EnvFile,
  ctx: InteractiveCtx
): Promise<number> {
  const changed = new Set<string>();
  let cancelled = false;

  const onInterrupt = (): void => {
    cancelled = true;
    prompt.write(`\n  ${style.yellow(symbol.warn)} cancelled — nothing was saved.\n`);
    process.exit(130);
  };
  process.once('SIGINT', onInterrupt);

  try {
    prompt.heading(`OkCMS config — ${ctx.relPath}`);
    prompt.info(`${env.keys().length} key(s) in file`);
    if (ctx.seeded) {
      prompt.warn('.env did not exist — wizard starts from .env.example; nothing saved yet');
    }
    prompt.info('Enter keeps the current value · Ctrl+C discards everything');

    const record = (): Record<string, string> => {
      const out = env.toRecord();
      for (const key of changed) out[key] = env.get(key) ?? '';
      return out;
    };

    const sectionIds = ENV_SECTIONS.map((section) => section.id);
    let target = ctx.section;

    // --section pula o menu principal (scriptável mesmo com TTY)
    if (target && !sectionIds.includes(target)) {
      prompt.error(`unknown section: ${target} — use one of: ${sectionIds.join(', ')}`);
      prompt.close();
      return 1;
    }

    for (;;) {
      if (cancelled) return 130;

      if (!target) {
        const choices = ENV_SECTIONS.map((section) => ({
          value: section.id,
          label: section.title,
          hint: `${section.hint} · ${fieldsForSection(section.id, record()).length} fields`,
        }));
        choices.push({
          value: '__show',
          label: 'Change summary',
          hint: changed.size > 0 ? `${changed.size} pending` : 'none',
        });
        choices.push({ value: '__quit', label: 'Quit', hint: 'confirm & save' });

        const picked = await prompt.select('Section', choices);
        if (picked === '__show') {
          printSummary(prompt, env, changed);
          continue;
        }
        if (picked === '__quit') break;
        target = picked;
      }

      await runSection(prompt, env, target, record, changed);
      target = undefined;

      const more = await prompt.confirm('Edit another section?', { defaultValue: false });
      if (!more) break;
    }

    if (changed.size === 0) {
      prompt.info('no changes — file untouched.');
      return 0;
    }

    const ok = await prompt.confirm(
      `Save ${changed.size} change(s) to ${ctx.relPath}?`,
      { defaultValue: true }
    );
    if (!ok) {
      prompt.warn('discarded — nothing was saved.');
      return 0;
    }

    env.save(ctx.path);
    prompt.success(`${changed.size} key(s) saved — permission 600`);
    prompt.info('restart the apps for changes to take effect (okcms start / restart containers)');
    return 0;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    prompt.close();
  }
}

function printSummary(prompt: Prompt, env: EnvFile, changed: Set<string>): void {
  prompt.heading('Summary');
  if (changed.size === 0) {
    prompt.info('no pending changes');
    return;
  }
  for (const key of changed) {
    const field = fieldByKey(key);
    const value = env.get(key) ?? '';
    const shown = field?.type === 'secret' ? maskValue(value) : value;
    prompt.write(`  ${style.cyan(symbol.arrow)} ${key}=${shown}\n`);
  }
}

async function runSection(
  prompt: Prompt,
  env: EnvFile,
  sectionId: string,
  record: () => Record<string, string>,
  changed: Set<string>
): Promise<void> {
  const section = sectionById(sectionId);
  if (!section) return;

  const fields = fieldsForSection(sectionId, record());
  prompt.heading(`${section.title} — ${section.hint}`);

  if (fields.length === 0) {
    prompt.info('no applicable fields right now');
    return;
  }

  for (const field of fields) {
    const current = env.get(field.key) ?? '';

    // JWT_SECRET fraco/ausente: oferece um gerado em vez de deixar escolha ruim
    if (field.key === 'JWT_SECRET' && !looksLikeSecret(current)) {
      const generate = await prompt.confirm(
        'JWT_SECRET missing/placeholder — generate a strong one?',
        { defaultValue: true }
      );
      if (generate) {
        const secret = generateSecret(32);
        env.set(field.key, secret);
        changed.add(field.key);
        prompt.success('JWT_SECRET generated (48 hex, 32 bytes)');
        continue;
      }
    }

    prompt.write(`  ${style.dim(`${symbol.bullet} ${field.description}`)}\n`);

    let value: string;
    if (field.type === 'secret') {
      value = await prompt.secret(field.label, {
        default: current,
        placeholder: current ? maskValue(current) : '(not set)',
        validate: (candidate) => validateField(field, candidate),
      });
    } else {
      const fallback = current || field.default || '';
      value = await prompt.ask(field.label, {
        default: fallback,
        placeholder: current ? current : field.default ? `${field.default} (default)` : undefined,
        validate: (candidate) => validateField(field, candidate),
      });
    }

    if (value !== current) {
      // Aceitar o default de uma chave ausente NÃO materializa a chave: o
      // aplicativo já aplica esse default, e gravar tudo a cada Enter enchi o
      // .env de ruído. Só persiste mudança explícita.
      const acceptedDefault = current === '' && value === (field.default ?? '');
      if (acceptedDefault) {
        prompt.info(`${field.key} not set — default ${value} applies`);
        continue;
      }

      env.set(field.key, value);
      changed.add(field.key);
      const shown = field.type === 'secret' ? maskValue(value) : value;
      prompt.success(`${field.key} → ${shown}`);
    }
  }
}
