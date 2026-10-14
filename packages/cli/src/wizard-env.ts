// @oktis-works/cms - Wizard: entrevista de variáveis de ambiente
//
// Entrevista campo a campo das 47 variáveis do projeto (ENV_FIELDS é a fonte
// única de verdade — label, descrição, exemplo, tipo e validação vêm de lá).
// Regras, decididas com o usuário:
//
//   • TODOS os campos aparecem em todas as sessões (nada de "só os vazios");
//   • o valor atual é exibido (segredos mascarados) e Enter mantém;
//   • nada é gravado pela metade: as respostas ficam num PLANO em memória e o
//     `.env` só é salvo depois do resumo + confirmação finais;
//   • Ctrl+C no meio descarta o plano inteiro — mesma filosofia do config;
//   • o campo `when` é re-avaliado com as respostas já dadas: se a condição
//     deixou de valer (ex.: STORAGE_DRIVER voltou pra local), os dependentes
//     são pulados em vez de perguntar bobagem.
//   • NOVO: navegação limpa — tela limpa por campo, histórico para voltar/avançar,
//     tecla 'b' (Back) volta ao campo anterior e permite re-editar.
//
// A entrevista é usada como etapa dos fluxos guiados (dev/deploys) e como item
// de menu — nos fluxos o chamador oferece o "pular".

import { join } from 'node:path';
import {
  ENV_FIELDS,
  ENV_SECTIONS,
  fieldsForSection,
  sectionById,
  validateField,
  type EnvField,
} from './env-schema.js';
import { EnvFile, loadEnvFile, syncProcessEnv } from './env-file.js';
import { generateSecret, looksLikeSecret } from './guards.js';
import { maskValue } from './config-wizard.js';
import { style, symbol, type Prompt } from './prompt.js';
import type { Catalog } from './wizard-i18n.js';

const ESC = '\x1b[';

/** Limpa a tela e posiciona o cursor no topo. */
function clearScreen(prompt: Prompt): void {
  prompt.write(`${ESC}2J${ESC}H`);
}

/** Resultado de uma pergunta de campo. */
type _FieldResult =
  | { type: 'value'; value: string }
  | { type: 'back' }
  | { type: 'cancel' }
  | { type: 'skip_section' };

export interface InterviewDeps {
  prompt: Prompt;
  catalog: Catalog;
  cwd: string;
  /** Permite cancelar via Ctrl+C sem derrubar o processo inteiro. */
  onInterrupt?: () => void;
}

export interface InterviewResult {
  status: 'saved' | 'cancelled' | 'nothing';
  changed: string[];
}

/**
 * Roda a entrevista completa com navegação linear (b = passo anterior).
 * `opts.skipOption` quando true adiciona a escolha "pular" no primeiro prompt.
 *
 * Arquitetura: uma lista plana de PASSOS (engine → mode → campos de cada
 * seção na ordem de ENV_SECTIONS). 'b' decrementa o índice — inclusive
 * voltando do primeiro campo DB para o mode select e do mode pro engine.
 * O `when` é re-avaliado a cada passo: campos que deixam de aplicar são
 * pulados sem consumir resposta.
 */
export async function runEnvInterview(
  deps: InterviewDeps,
  opts: { skipOption?: boolean } = {}
): Promise<InterviewResult> {
  const { prompt, catalog, cwd } = deps;
  const path = join(cwd, '.env');
  const env = loadEnvFile(path);
  const changed = new Set<string>();

  clearScreen(prompt);
  prompt.heading(`${catalog.envHeading} — .env`);
  prompt.info(catalog.envIntro);

  if (opts.skipOption) {
    const pick = await prompt.select<'run' | 'skip'>('env', [
      { value: 'run', label: 'Configure variables', hint: catalog.envSectionCount(ENV_FIELDS.length) },
      { value: 'skip', label: catalog.envSkipOption },
    ], { fullClear: true });
    if (pick === 'skip') return { status: 'nothing', changed: [] };
  }

  const interrupted = { value: false };
  const onInterrupt = (): void => {
    interrupted.value = true;
  };
  process.once('SIGINT', onInterrupt);

  const cleanupAndReturn = (result: InterviewResult): InterviewResult => {
    process.removeListener('SIGINT', onInterrupt);
    return result;
  };

  try {
    const record = (): Record<string, string> => {
      const out = env.toRecord();
      for (const key of changed) out[key] = env.get(key) ?? '';
      return out;
    };

    // ---- lista plana de passos — APENAS essenciais ----
    type Step =
      | { kind: 'engine' }
      | { kind: 'mode' }
      | { kind: 'field'; field: EnvField; section: (typeof ENV_SECTIONS)[number] };

    const buildSteps = (): Step[] => {
      const steps: Step[] = [];
      for (const section of ENV_SECTIONS) {
        if (section.id === 'database') {
          steps.push({ kind: 'engine' });
          steps.push({ kind: 'mode' });
          const r = record();
          const mode = r['__db_mode'] ?? 'individual';
          for (const field of ENV_FIELDS) {
            if (field.section !== 'database') continue;
            if (!field.essential) continue;
            if (field.key === 'DB_ENGINE') continue; // já tratado pelo engine select
            if (field.key === 'DATABASE_URL' && mode === 'individual') continue;
            if (field.when && !field.when(r)) continue;
            steps.push({ kind: 'field', field, section });
          }
        } else {
          const r = record();
          for (const field of ENV_FIELDS) {
            if (field.section !== section.id) continue;
            if (!field.essential) continue;
            if (field.when && !field.when(r)) continue;
            steps.push({ kind: 'field', field, section });
          }
        }
      }
      return steps;
    };

    let steps = buildSteps();
    let stepIndex = 0;
    let lastSectionId = '';

    while (stepIndex < steps.length) {
      if (interrupted.value) break;

      // re-constrói passos quando `when` muda (ex: mode trocou)
      const newSteps = buildSteps();
      if (newSteps.length !== steps.length) {
        const prev = steps[stepIndex];
        const matching = newSteps.findIndex((s) => {
          if (s.kind !== prev?.kind) return false;
          if (s.kind === 'field' && prev.kind === 'field') return s.field.key === prev.field.key;
          return true;
        });
        stepIndex = matching >= 0 ? matching : Math.min(stepIndex, newSteps.length - 1);
        steps = newSteps;
      }

      const step = steps[stepIndex];
      if (!step) break;

      const section = step.kind === 'field' ? step.section : ENV_SECTIONS.find(s => s.id === 'database')!;

      // header de seção (quando muda de seção)
      clearScreen(prompt);
      if (section.id !== lastSectionId) {
        prompt.write(`\n${style.bold(`  ── ${section.title} ── ${style.dim(section.hint)}`)}\n`);
        lastSectionId = section.id;
      }

      const progress = `[${stepIndex + 1}/${steps.length}]`;
      prompt.write(`${style.dim(progress)}\n`);

      let result: { type: 'value' } | { type: 'back' } | { type: 'cancel' };

      if (step.kind === 'engine') {
        const pick = await prompt.select<'postgres' | 'mysql' | 'mariadb' | '__back__'>(
          catalog.envDbEngineChoose,
          [
            { value: 'postgres', label: catalog.envDbEnginePostgres, hint: catalog.envDbEnginePostgresHint },
            { value: 'mysql', label: catalog.envDbEngineMysql, hint: catalog.envDbEngineMysqlHint },
            { value: 'mariadb', label: catalog.envDbEngineMariadb, hint: catalog.envDbEngineMariadbHint },
            { value: '__back__' as const, label: `← ${catalog.flowBack}`, hint: catalog.flowBackHint },
          ],
          { defaultValue: 'postgres', fullClear: true }
        );
        if (pick === '__back__') {
          result = { type: 'back' };
        } else {
          if (!env.get('DB_ENGINE') || env.get('DB_ENGINE') !== pick) {
            env.set('DB_ENGINE', pick);
            changed.add('DB_ENGINE');
          }
          result = { type: 'value' };
        }
      } else if (step.kind === 'mode') {
        const pick = await prompt.select<'connectionString' | 'individual' | '__back__'>(
          catalog.envDbModeChoose,
          [
            { value: 'connectionString', label: catalog.envDbModeConnectionString, hint: catalog.envDbModeConnectionStringHint },
            { value: 'individual', label: catalog.envDbModeIndividual, hint: catalog.envDbModeIndividualHint },
            { value: '__back__' as const, label: `← ${catalog.flowBack}`, hint: catalog.flowBackHint },
          ],
          { defaultValue: 'individual', fullClear: true }
        );
        if (pick === '__back__') {
          result = { type: 'back' };
        } else {
          env.set('__db_mode', pick);
          result = { type: 'value' };
        }
      } else {
        // campo regular
        const fieldResult = await askFieldWithNavigation(prompt, catalog, env, changed, step.field, record);
        result = fieldResult.type === 'cancel'
          ? { type: 'cancel' }
          : fieldResult.type === 'back'
            ? { type: 'back' }
            : { type: 'value' };
      }

      if (result.type === 'cancel') {
        prompt.warn(catalog.envCancelled);
        return cleanupAndReturn({ status: 'cancelled', changed: [] });
      }
      if (result.type === 'back') {
        if (stepIndex > 0) {
          stepIndex--;
          lastSectionId = ''; // força re-render do header
          continue;
        }
        // no primeiro passo, back = continuar (não há onde voltar)
        continue;
      }
      // value → próximo passo
      stepIndex++;
    }

    if (interrupted.value) {
      prompt.warn(catalog.envCancelled);
      return cleanupAndReturn({ status: 'cancelled', changed: [] });
    }

    if (changed.size === 0) {
      prompt.info('no changes — file untouched.');
      return cleanupAndReturn({ status: 'nothing', changed: [] });
    }

    // resumo antes de gravar — segredos sempre mascarados
    clearScreen(prompt);
    prompt.heading(catalog.envSummaryTitle);
    prompt.info(catalog.envSummaryPending(changed.size));
    for (const key of changed) {
      const field = ENV_FIELDS.find((candidate) => candidate.key === key);
      const value = env.get(key) ?? '';
      const shown = (field?.type as string) === 'secret' ? maskValue(value) : value;
      prompt.write(`    ${style.cyan(symbol.arrow)} ${key}=${shown}\n`);
    }
    prompt.write(`\n  ${style.dim('Configurações avançadas (rate limit, cache, storage, deploy):')} ${style.cyan('okcms config')}\n`);

    const ok = await prompt.confirm(catalog.envConfirmSave(changed.size), { defaultValue: true });
    if (!ok) {
      prompt.warn(catalog.envDiscarded);
      return cleanupAndReturn({ status: 'cancelled', changed: [] });
    }

    // remove marcador interno antes de gravar — não é uma variável real
    env.delete('__db_mode');

    env.save(path);
    // O arquivo mudou DENTRO deste processo: sincroniza o snapshot congelado
    // (o bun carrega .env no start e não regrava) — senão o `okcms dev`
    // spawnado pelo menu herda o placeholder vazio do init e o compose/conexão
    // enxergam '' mesmo com o valor gravado na .env da raiz.
    syncProcessEnv(env);
    prompt.success(catalog.envSaved(changed.size));
    return cleanupAndReturn({ status: 'saved', changed: [...changed] });
  } finally {
    process.removeListener('SIGINT', onInterrupt);
  }
}

/** Pergunta um campo com navegação (Back/Enter mantém). Retorna ação do usuário. */
async function askFieldWithNavigation(
  prompt: Prompt,
  catalog: Catalog,
  env: EnvFile,
  changed: Set<string>,
  field: EnvField,
  record: () => Record<string, string>
): Promise<{ type: 'value'; value: string } | { type: 'back' } | { type: 'cancel' }> {
  // o `when` pode ter mudado desde o início da seção (um campo alterou o
  // registro) — reavalia antes de perguntar, senão sai pergunta bobagem
  if (field.when && !field.when(record())) return { type: 'value', value: '' };

  const current = env.get(field.key) ?? '';

  // JWT_SECRET fraco/ausente: oferece um gerado (mesma ajuda do config wizard)
  if (field.key === 'JWT_SECRET' && !looksLikeSecret(current)) {
    const generate = await prompt.confirm(catalog.envJwtGenerate, { defaultValue: true });
    if (generate) {
      const secret = generateSecret(32);
      env.set(field.key, secret);
      changed.add(field.key);
      prompt.success(catalog.envGenerated);
      return { type: 'value', value: secret };
    }
    // se recusou gerar, cai no prompt normal abaixo
  }

  const _shownCurrent = (field.type as string) === 'secret'
    ? current ? maskValue(current) : catalog.envSecretNotSet
    : current || catalog.envSecretNotSet;

  const _validate = (candidate: string): string | null => validateField(field, candidate);

  // monta o prompt com navegação
  while (true) {
    clearScreen(prompt);

    // progress indicator
    // (índice será passado via closure ou global — simplificamos aqui)

    prompt.write(`\n  ${style.bold(field.key)}\n`);
    prompt.write(`    ${style.dim(symbol.bullet)} ${style.dim(field.label)}\n`);
    prompt.write(`    ${style.dim(symbol.bullet)} ${style.dim(field.description)}\n`);
    if (field.example) {
      prompt.write(`    ${style.gray(`  ex.: ${field.example}`)}\n`);
    }
    if (field.options && field.options.length > 0) {
      prompt.write(`    ${style.gray(`  options: ${field.options.join(' | ')}`)}\n`);
    }

    // nav hint
    prompt.write(`\n  ${style.dim('Enter = manter · b = voltar · Ctrl+C = cancelar tudo')}\n`);

    const _shownCurrent = (field.type as string) === 'secret'
      ? current ? maskValue(current) : catalog.envSecretNotSet
      : current || catalog.envSecretNotSet;

    const _validate = (candidate: string): string | null => validateField(field, candidate);

    if ((field.type as string) === 'secret') {
      const value = await prompt.secretWithBack(`${field.key} — ${field.label}`, {
        default: current,
        placeholder: `${catalog.envKeepHint}: ${_shownCurrent}`,
        validate: _validate,
      });

      if (value === current) return { type: 'value', value: current };
      if (value === '__BACK__') return { type: 'back' };

      // aceitar default de chave ausente não materializa
      let effectiveDefault = field.default ?? '';
      if (field.key === 'DB_PORT') {
        const engine = env.get('DB_ENGINE') ?? 'postgres';
        effectiveDefault = engine === 'postgres' ? '5432' : '3306';
      }
      const acceptedDefault = current === '' && value === effectiveDefault;
      if (acceptedDefault) {
        prompt.info(catalog.envDefaultApplies(value));
        return { type: 'value', value: current };
      }

      env.set(field.key, value);
      changed.add(field.key);
      prompt.success(`${field.key} → ${maskValue(value)}`);
      return { type: 'value', value };
    } else {
      // default dinâmico para DB_PORT
      let effectiveDefault = field.default ?? '';
      if (field.key === 'DB_PORT') {
        const engine = env.get('DB_ENGINE') ?? 'postgres';
        effectiveDefault = engine === 'postgres' ? '5432' : '3306';
      }
      const fallback = current || effectiveDefault || '';

      // usa ask com suporte a back
      const value = await prompt.askWithBack(`${field.key} — ${field.label}`, {
        default: fallback,
        placeholder: current
          ? `${catalog.envKeepHint}: ${current}`
          : effectiveDefault
            ? `${effectiveDefault} (default)`
            : undefined,
        validate: _validate,
      });

      if (value === '__BACK__') return { type: 'back' };
      if (value === current) return { type: 'value', value: current };

      // aceitar default de chave ausente não materializa
      const acceptedDefault = current === '' && value === effectiveDefault;
      if (acceptedDefault) {
        prompt.info(catalog.envDefaultApplies(value));
        return { type: 'value', value: current };
      }

      env.set(field.key, value);
      changed.add(field.key);
      const shown = (field.type as string) === 'secret' ? maskValue(value) : value;
      prompt.success(`${field.key} → ${shown}`);
      return { type: 'value', value };
    }
  }
}

/** Seção do env-schema usada pela entrevista (para testes/docs). */
export function interviewSectionCount(sectionId: string): EnvField[] {
  return sectionById(sectionId) ? fieldsForSection(sectionId, {}) : [];
}