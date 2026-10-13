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
import { EnvFile, loadEnvFile } from './env-file.js';
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
 * Roda a entrevista completa. `opts.skipOption` quando true adiciona a escolha
 * "pular" no primeiro prompt (contexto de fluxo guiado).
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
    ]);
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
    // respostas parciais alimentam o `when` dos próximos campos
    const record = (): Record<string, string> => {
      const out = env.toRecord();
      for (const key of changed) out[key] = env.get(key) ?? '';
      return out;
    };

    for (const section of ENV_SECTIONS) {
      if (interrupted.value) break;

      clearScreen(prompt);

      // seção de banco: antes de tudo, pergunta o engine, depois o modo de conexão
      if (section.id === 'database') {
        // 1. Escolha do engine
        const engine = await prompt.select<'postgres' | 'mysql' | 'mariadb'>(
          catalog.envDbEngineChoose,
          [
            { value: 'postgres', label: catalog.envDbEnginePostgres, hint: catalog.envDbEnginePostgresHint },
            { value: 'mysql', label: catalog.envDbEngineMysql, hint: catalog.envDbEngineMysqlHint },
            { value: 'mariadb', label: catalog.envDbEngineMariadb, hint: catalog.envDbEngineMariadbHint },
          ],
          { defaultValue: 'postgres' }
        );

        // salva o engine no env para usar no default dinâmico do DB_PORT
        if (!env.get('DB_ENGINE') || env.get('DB_ENGINE') !== engine) {
          env.set('DB_ENGINE', engine);
          changed.add('DB_ENGINE');
        }

        // 2. Modo de conexão
        const mode = await prompt.select<'connectionString' | 'individual'>(
          catalog.envDbModeChoose,
          [
            { value: 'connectionString', label: catalog.envDbModeConnectionString, hint: catalog.envDbModeConnectionStringHint },
            { value: 'individual', label: catalog.envDbModeIndividual, hint: catalog.envDbModeIndividualHint },
          ],
          { defaultValue: 'individual' }
        );

        // marca o modo no record para filtrar DATABASE_URL no modo individual
        if (mode === 'individual') {
          env.set('__db_mode', 'individual');
        } else {
          env.set('__db_mode', 'connectionString');
        }

        if (mode === 'connectionString') {
          // modo string de conexão: pergunta DATABASE_URL + garante DB_PASSWORD para a infra
          const dbUrlField = ENV_FIELDS.find((f) => f.key === 'DATABASE_URL')!;
          const result = await askFieldWithNavigation(prompt, catalog, env, changed, dbUrlField, record);
          if (result.type === 'cancel') {
            prompt.warn(catalog.envCancelled);
            return cleanupAndReturn({ status: 'cancelled', changed: [] });
          }
          if (result.type === 'back') {
            // voltar para engine selection - reinicia a seção
            return await runEnvInterview(deps, opts);
          }

          // DB_PASSWORD é necessário para a infra local (compose precisa)
          // mesmo quando usando DATABASE_URL externo — gera se não existir
          const currentPwd = env.get('DB_PASSWORD') ?? '';
          if (!currentPwd || !looksLikeSecret(currentPwd)) {
            const secret = generateSecret(24);
            env.set('DB_PASSWORD', secret);
            changed.add('DB_PASSWORD');
            prompt.success(`DB_PASSWORD gerado para a infra local: ${maskValue(secret)}`);
          }
          continue; // pula os campos DB_* individuais
        }
        // modo individual: segue o fluxo normal (campos DB_* com when)
      }

      let fields = fieldsForSection(section.id, record());

      // no modo individual, não mostrar DATABASE_URL (só aparece no modo connectionString)
      if (section.id === 'database') {
        const mode = record()['__db_mode'];
        if (mode === 'individual') {
          fields = fields.filter((f) => f.key !== 'DATABASE_URL');
        }
      }

      if (fields.length === 0) continue;

      prompt.write(`\n${style.bold(`  ── ${section.title} ── ${style.dim(section.hint)}`)}\n`);
      prompt.info(catalog.envSectionCount(fields.length));

      // loop com navegação para os campos da seção
      let fieldIndex = 0;
      while (fieldIndex < fields.length) {
        if (interrupted.value) break;

        clearScreen(prompt);

        // header da seção (só no primeiro campo da seção)
        if (fieldIndex === 0) {
          prompt.write(`\n${style.bold(`  ── ${section.title} ── ${style.dim(section.hint)}`)}\n`);
          prompt.info(catalog.envSectionCount(fields.length));
        }

        // progress indicator
        const progress = `[${fieldIndex + 1}/${fields.length}]`;
        prompt.write(`${style.dim(progress)} ${style.bold(fields[fieldIndex]!.key)}\n`);

        const field = fields[fieldIndex]!;
        const result = await askFieldWithNavigation(prompt, catalog, env, changed, field, record);

        if (result.type === 'cancel') {
          prompt.warn(catalog.envCancelled);
          return cleanupAndReturn({ status: 'cancelled', changed: [] });
        }
        if (result.type === 'back') {
          if (fieldIndex > 0) {
            fieldIndex--;
            continue;
          } else {
            // no primeiro campo da seção, back = voltar para seção anterior
            // para simplificar, volta para o menu principal (reinicia a entrevista)
            return await runEnvInterview(deps, opts);
          }
        }
        if (result.type === 'value') {
          fieldIndex++;
          continue;
        }
      }
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

    const ok = await prompt.confirm(catalog.envConfirmSave(changed.size), { defaultValue: true });
    if (!ok) {
      prompt.warn(catalog.envDiscarded);
      return cleanupAndReturn({ status: 'cancelled', changed: [] });
    }

    env.save(path);
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