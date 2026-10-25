// @oktis-works/cms - Wizard i18n: catálogo de mensagens plugável (en/pt)
//
// O wizard começa em inglês e permite trocar o idioma durante a sessão. O
// catálogo é um DICIONÁRIO plugável: adicionar um idioma novo = acrescentar um
// objeto `Catalog` em `CATALOGS` (o tipo força preencher toda a UI — um campo
// esquecido é erro de compilação, não texto vazio em produção).
//
// Comandos e nomes de flags NUNCA são traduzidos: a sintaxe que o usuário copia
// pra automação é sempre a real (`okcms deploy --target blue-green`).

import { detectProjectDocsLang } from './scaffold-docs.js';

export type WizardLang = 'en' | 'pt';

export interface Catalog {
  // cabeçalho / menu principal
  title: string;
  langLabel: (current: WizardLang) => string;
  pickLang: string;
  // sugestão adaptativa (banner de próximo passo)
  suggestNone: string;
  suggestInit: string;
  suggestEnv: string;
  suggestInfra: string;
  suggestApps: string;
  suggestDeploy: string;
  // itens do menu principal
  menuFlows: string;
  menuFlowsHint: string;
  menuCommand: string;
  menuCommandHint: string;
  menuEnv: string;
  menuEnvHint: string;
  menuStatus: string;
  menuStatusHint: string;
  menuRefresh: string;
  menuRefreshHint: string;
  menuExit: string;
  menuExitHint: string;
  // seções
  flowsHeading: string;
  catalogHeading: string;
  envHeading: string;
  statusHeading: string;
  languageHeading: string;
  // estado do projeto (status)
  statusNoProject: string;
  statusProject: (name: string) => string;
  statusEnvComplete: string;
  statusEnvIncomplete: (missing: number) => string;
  statusDockerUp: string;
  statusDockerDown: string;
  statusInfraUp: string;
  statusInfraDown: string;
  statusAppsUp: (labels: string) => string;
  statusAppsDown: string;
  statusRefreshed: string;
  pressToReturn: string;
  // espelho de automação + execução
  mirrorLine: (command: string) => string;
  running: (command: string) => string;
  exitedZero: string;
  exitedNonZero: (code: number) => string;
  onFailure: string;
  failDoctor: string;
  failRetry: string;
  failMenu: string;
  longRunning: string;
  interrupted: string;
  // entrevista de env
  envIntro: string;
  envSkipOption: string;
  envKeepHint: string;
  envSectionCount: (count: number) => string;
  envSecretNotSet: string;
  envJwtGenerate: string;
  envGenerated: string;
  envSaved: (count: number) => string;
  envDiscarded: string;
  envDefaultApplies: (value: string) => string;
  envSummaryTitle: string;
  envSummaryPending: (count: number) => string;
  envConfirmSave: (count: number) => string;
  envCancelled: string;
  envNoProject: string;
  // entrevista de env — engine de banco
  envDbEngineChoose: string;
  envDbEnginePostgres: string;
  envDbEnginePostgresHint: string;
  envDbEngineMysql: string;
  envDbEngineMysqlHint: string;
  envDbEngineMariaDb: string;
  envDbEngineMariaDbHint: string;
  // entrevista de env — modo de conexão do banco
  envDbModeChoose: string;
  envDbModeConnectionString: string;
  envDbModeConnectionStringHint: string;
  envDbModeIndividual: string;
  envDbModeIndividualHint: string;
  // fluxos guiados
  flowInit: string;
  flowInitHint: string;
  flowDev: string;
  flowDevHint: string;
  flowDeployBg: string;
  flowDeployBgHint: string;
  flowDeploySimple: string;
  flowDeploySimpleHint: string;
  flowDeployPm2: string;
  flowDeployPm2Hint: string;
  flowUpdate: string;
  flowUpdateHint: string;
  flowBack: string;
  flowBackHint: string;
  // passos dos fluxos
  stepIntro: (flow: string) => string;
  stepEnvAsk: string;
  stepEnvSkip: string;
  stepPrecheck: string;
  stepAppsRunning: string;
  stepStopFirst: string;
  stepConfirmRun: (command: string) => string;
  stepCancelled: string;
  deployTargetSummary: (target: string) => string;
  updateSummary: string;
  initWhatItDoes: string;
  devWhatItDoes: string;
  // catálogo de comandos
  catalogIntro: string;
  catalogPickCommand: string;
  catalogRequired: (flag: string, desc: string) => string;
  catalogAddOptionals: string;
  catalogPickOptional: string;
  catalogValueFor: (flag: string, desc: string) => string;
  catalogDanger: (name: string) => string;
  catalogConfirmDanger: (command: string) => string;
  catalogConfirmRun: (command: string) => string;
  catalogDone: string;
  // avisos gerais
  warnNoProject: string;
  bye: string;
}

const en: Catalog = {
  title: 'OKCMS wizard',
  langLabel: (current) => `language: ${current}`,
  pickLang: 'Interface language',

  suggestNone: 'what would you like to do?',
  suggestInit: 'no project here yet — start with a new project',
  suggestEnv: 'next step: complete the environment variables (.env)',
  suggestInfra: 'next step: start the infrastructure (Postgres + Redis)',
  suggestApps: 'next step: start the apps (okcms start)',
  suggestDeploy: 'apps are running locally — deploy when ready',

  menuFlows: 'Guided flows',
  menuFlowsHint: 'init · dev · deploy blue-green/simple/pm2 · update',
  menuCommand: 'Run a command',
  menuCommandHint: 'all {n} CLI commands, grouped — dangerous ones marked',
  menuEnv: 'Configure .env',
  menuEnvHint: 'field-by-field interview for essential variables',
  menuStatus: 'Project status',
  menuStatusHint: 'docker, infrastructure, apps, environment',
  menuRefresh: 'Refresh status',
  menuRefreshHint: 're-probe docker/apps/.env',
  menuExit: 'Exit',
  menuExitHint: 'back to the shell',

  flowsHeading: 'Guided flows',
  catalogHeading: 'Commands',
  envHeading: 'Environment variables',
  statusHeading: 'Project status',
  languageHeading: 'Language',

  statusNoProject: 'no OkCMS project in this directory (run okcms init)',
  statusProject: (name) => `project: ${name}`,
  statusEnvComplete: '.env: complete',
  statusEnvIncomplete: (missing) => `.env: ${missing} required variable(s) missing`,
  statusDockerUp: 'docker: up',
  statusDockerDown: 'docker: not available',
  statusInfraUp: 'infrastructure: running (Postgres + Redis)',
  statusInfraDown: 'infrastructure: not running',
  statusAppsUp: (labels) => `apps: running (${labels})`,
  statusAppsDown: 'apps: not running',
  statusRefreshed: 'status refreshed',
  pressToReturn: 'Press Enter to return...',

  mirrorLine: (command) => `$ ${command}`,
  running: (command) => `running: ${command}`,
  exitedZero: 'finished with success',
  exitedNonZero: (code) => `exited with code ${code}`,
  onFailure: 'command failed — what now?',
  failDoctor: 'Run diagnostics (okcms doctor)',
  failRetry: 'Retry the same command',
  failMenu: 'Back to the menu',
  longRunning: 'long-running command — press Ctrl+C to stop it and return to the wizard',
  interrupted: 'interrupted — returned to the wizard',

  envIntro: 'Enter keeps the current value · empty input keeps it too · Ctrl+C cancels everything',
  envSkipOption: 'Skip — use the current .env as-is',
  envKeepHint: 'current',
  envSectionCount: (count) => `${count} field(s) in this section`,
  envSecretNotSet: '(not set)',
  envJwtGenerate: 'JWT_SECRET is missing or a placeholder — generate a strong one?',
  envGenerated: 'JWT_SECRET generated (48 hex, 32 bytes)',
  envSaved: (count) => `${count} key(s) saved to .env (permission 600)`,
  envDiscarded: 'discarded — nothing was saved',
  envDefaultApplies: (value) => `not set — the default (${value}) applies`,
  envSummaryTitle: 'Review before saving',
  envSummaryPending: (count) => `${count} pending change(s)`,
  envConfirmSave: (count) => `Save ${count} change(s) to .env?`,
  envCancelled: 'cancelled — nothing was saved',
  envNoProject: 'no .env to edit — run okcms init (or okcms dev) first',
  envDbEngineChoose: 'Which database engine do you want to use?',
  envDbEnginePostgres: 'PostgreSQL',
  envDbEnginePostgresHint: 'PostgreSQL 16 (default port 5432)',
  envDbEngineMysql: 'MySQL',
  envDbEngineMysqlHint: 'MySQL 8.0.36+ (default port 3306)',
  envDbEngineMariaDb: 'MariaDB',
  envDbEngineMariaDbHint: 'MariaDB 11.4+ (default port 3306)',
  envDbModeChoose: 'How do you want to configure the database connection?',
  envDbModeConnectionString: 'Connection string (DATABASE_URL)',
  envDbModeConnectionStringHint: 'single URL like postgres://user:pass@host:5432/db',
  envDbModeIndividual: 'Individual values (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)',
  envDbModeIndividualHint: 'separate host/port/name/user/password fields',

  flowInit: 'New project',
  flowInitHint: 'scaffold a fresh OkCMS project from zero',
  flowDev: 'Local development',
  flowDevHint: 'env → infra → migrations → first admin → apps',
  flowDeployBg: 'Deploy: blue/green',
  flowDeployBgHint: 'zero-downtime lanes behind the proxy',
  flowDeploySimple: 'Deploy: simple',
  flowDeploySimpleHint: 'plain containers (okcms-api/web/admin)',
  flowDeployPm2: 'Deploy: PM2',
  flowDeployPm2Hint: 'process manager on the host',
  flowUpdate: 'Update',
  flowUpdateHint: 'packages + migrations + redeploy',
  flowBack: 'Back',
  flowBackHint: 'return to the main menu',

  stepIntro: (flow) => `Flow: ${flow}`,
  stepEnvAsk: 'Configure environment variables first?',
  stepEnvSkip: 'using the current .env',
  stepPrecheck: 'pre-checks',
  stepAppsRunning: 'local apps are running — they hold the ports the containers need',
  stepStopFirst: 'stop them now (okcms stop)?',
  stepConfirmRun: (command) => `Run ${command}?`,
  stepCancelled: 'cancelled — nothing was executed',
  deployTargetSummary: (target) => `deploy target: ${target}`,
  updateSummary:
    'update = download packages → apply migrations → redeploy (blue/green, simple or PM2)',
  initWhatItDoes:
    'init scaffolds the project: apps, .env.example, okcms.config.json, docs (README/PLUGIN/THEME) and dependency install',
  devWhatItDoes:
    'dev prepares everything and runs locally: .env → Docker infra (Postgres/Redis) → migrations → first admin user → API + Admin + Web',

  catalogIntro: 'Every command here prints its CLI line first — copy it for scripts/CI',
  catalogPickCommand: 'Command',
  catalogRequired: (flag, desc) => `${flag} — ${desc}`,
  catalogAddOptionals: 'Add optional flags?',
  catalogPickOptional: 'Optional flag (choose "run" to execute)',
  catalogValueFor: (flag, desc) => `Value for ${flag} (${desc})`,
  catalogDanger: (name) => `${name} — DESTRUCTIVE`,
  catalogConfirmDanger: (command) => `${command}\nThis command can destroy data. Run it anyway?`,
  catalogConfirmRun: (command) => `Run ${command}?`,
  catalogDone: 'command finished',

  warnNoProject: 'this command expects an OkCMS project (okcms.config.json / .env)',
  bye: 'bye',
};

const pt: Catalog = {
  title: 'OKCMS wizard',
  langLabel: (current) => `idioma: ${current}`,
  pickLang: 'Idioma da interface',

  suggestNone: 'o que você quer fazer?',
  suggestInit: 'não há projeto aqui ainda — comece criando um projeto',
  suggestEnv: 'próximo passo: completar as variáveis de ambiente (.env)',
  suggestInfra: 'próximo passo: subir a infraestrutura (Postgres + Redis)',
  suggestApps: 'próximo passo: subir os apps (okcms start)',
  suggestDeploy: 'apps rodando localmente — deploy quando quiser',

  menuFlows: 'Fluxos guiados',
  menuFlowsHint: 'init · dev · deploy blue-green/simple/pm2 · update',
  menuCommand: 'Rodar um comando',
  menuCommandHint: 'todos os {n} comandos do CLI, agrupados — destrutivos marcados',
  menuEnv: 'Configurar .env',
  menuEnvHint: 'entrevista campo a campo das variáveis essenciais',
  menuStatus: 'Status do projeto',
  menuStatusHint: 'docker, infraestrutura, apps, ambiente',
  menuRefresh: 'Atualizar status',
  menuRefreshHint: 're-sondear docker/apps/.env',
  menuExit: 'Sair',
  menuExitHint: 'voltar ao shell',

  flowsHeading: 'Fluxos guiados',
  catalogHeading: 'Comandos',
  envHeading: 'Variáveis de ambiente',
  statusHeading: 'Status do projeto',
  languageHeading: 'Idioma',

  statusNoProject: 'nenhum projeto OkCMS neste diretório (rode okcms init)',
  statusProject: (name) => `projeto: ${name}`,
  statusEnvComplete: '.env: completo',
  statusEnvIncomplete: (missing) => `.env: ${missing} variável(is) obrigatória(s) faltando`,
  statusDockerUp: 'docker: disponível',
  statusDockerDown: 'docker: indisponível',
  statusInfraUp: 'infraestrutura: rodando (Postgres + Redis)',
  statusInfraDown: 'infraestrutura: não está rodando',
  statusAppsUp: (labels) => `apps: rodando (${labels})`,
  statusAppsDown: 'apps: não estão rodando',
  statusRefreshed: 'status atualizado',
  pressToReturn: 'Pressione Enter para voltar...',

  mirrorLine: (command) => `$ ${command}`,
  running: (command) => `executando: ${command}`,
  exitedZero: 'finalizou com sucesso',
  exitedNonZero: (code) => `saiu com código ${code}`,
  onFailure: 'o comando falhou — e agora?',
  failDoctor: 'Rodar diagnóstico (okcms doctor)',
  failRetry: 'Tentar de novo o mesmo comando',
  failMenu: 'Voltar ao menu',
  longRunning: 'comando de longa duração — Ctrl+C para voltar ao wizard',
  interrupted: 'interrompido — voltando ao wizard',

  envIntro: 'Enter mantém o valor atual · vazio também mantém · Ctrl+C cancela tudo',
  envSkipOption: 'Pular — usar o .env atual como está',
  envKeepHint: 'atual',
  envSectionCount: (count) => `${count} campo(s) nesta seção`,
  envSecretNotSet: '(não definido)',
  envJwtGenerate: 'JWT_SECRET ausente ou placeholder — gerar um forte?',
  envGenerated: 'JWT_SECRET gerado (48 hex, 32 bytes)',
  envSaved: (count) => `${count} chave(s) salva(s) no .env (permissão 600)`,
  envDiscarded: 'descartado — nada foi salvo',
  envDefaultApplies: (value) => `não definido — o default (${value}) vale`,
  envSummaryTitle: 'Confira antes de salvar',
  envSummaryPending: (count) => `${count} alteração(ões) pendente(s)`,
  envConfirmSave: (count) => `Salvar ${count} alteração(ões) no .env?`,
  envCancelled: 'cancelado — nada foi salvo',
  envNoProject: 'não há .env para editar — rode okcms init (ou okcms dev) primeiro',
  envDbEngineChoose: 'Qual engine de banco de dados você quer usar?',
  envDbEnginePostgres: 'PostgreSQL',
  envDbEnginePostgresHint: 'PostgreSQL 16 (porta padrão 5432)',
  envDbEngineMysql: 'MySQL',
  envDbEngineMysqlHint: 'MySQL 8.0.36+ (porta padrão 3306)',
  envDbEngineMariaDb: 'MariaDB',
  envDbEngineMariaDbHint: 'MariaDB 11.4+ (porta padrão 3306)',
  envDbModeChoose: 'Como você quer configurar a conexão com o banco de dados?',
  envDbModeConnectionString: 'String de conexão (DATABASE_URL)',
  envDbModeConnectionStringHint: 'URL única como postgres://user:pass@host:5432/db',
  envDbModeIndividual: 'Valores individuais (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)',
  envDbModeIndividualHint: 'campos separados de host/porta/nome/usuário/senha',

  flowInit: 'Projeto novo',
  flowInitHint: 'criar um projeto OkCMS do zero',
  flowDev: 'Desenvolvimento local',
  flowDevHint: 'env → infra → migrations → primeiro admin → apps',
  flowDeployBg: 'Deploy: blue/green',
  flowDeployBgHint: 'lanes sem downtime atrás do proxy',
  flowDeploySimple: 'Deploy: simple',
  flowDeploySimpleHint: 'containers diretos (okcms-api/web/admin)',
  flowDeployPm2: 'Deploy: PM2',
  flowDeployPm2Hint: 'process manager no host',
  flowUpdate: 'Atualizar',
  flowUpdateHint: 'pacotes + migrations + redeploy',
  flowBack: 'Voltar',
  flowBackHint: 'menu principal',

  stepIntro: (flow) => `Fluxo: ${flow}`,
  stepEnvAsk: 'Configurar as variáveis de ambiente primeiro?',
  stepEnvSkip: 'usando o .env atual',
  stepPrecheck: 'pré-checagens',
  stepAppsRunning: 'apps locais estão rodando — eles ocupam as portas que os containers precisam',
  stepStopFirst: 'parar agora (okcms stop)?',
  stepConfirmRun: (command) => `Rodar ${command}?`,
  stepCancelled: 'cancelado — nada foi executado',
  deployTargetSummary: (target) => `alvo do deploy: ${target}`,
  updateSummary:
    'update = baixar pacotes → aplicar migrations → redesploy (blue/green, simple ou PM2)',
  initWhatItDoes:
    'init cria o projeto: apps, .env.example, okcms.config.json, docs (README/PLUGIN/THEME) e instala as dependências',
  devWhatItDoes:
    'dev prepara tudo e roda local: .env → infra Docker (Postgres/Redis) → migrations → primeiro admin → API + Admin + Web',

  catalogIntro: 'Todo comando aqui imprime a linha de CLI primeiro — copie pra automação/CI',
  catalogPickCommand: 'Comando',
  catalogRequired: (flag, desc) => `${flag} — ${desc}`,
  catalogAddOptionals: 'Adicionar flags opcionais?',
  catalogPickOptional: 'Flag opcional (escolha "executar" para rodar)',
  catalogValueFor: (flag, desc) => `Valor para ${flag} (${desc})`,
  catalogDanger: (name) => `${name} — DESTRUTIVO`,
  catalogConfirmDanger: (command) => `${command}\nEste comando pode destruir dados. Rodar mesmo assim?`,
  catalogConfirmRun: (command) => `Rodar ${command}?`,
  catalogDone: 'comando finalizado',

  warnNoProject: 'este comando espera um projeto OkCMS (okcms.config.json / .env)',
  bye: 'até mais',
};

export const CATALOGS: Record<WizardLang, Catalog> = { en, pt };

export const WIZARD_LANGS: WizardLang[] = ['en', 'pt'];

/**
 * Idioma inicial do wizard: sempre EN por padrão; se o projeto já tem docs em
 * português, o wizard SUGERE pt na primeira interação (não força).
 */
export function initialLang(cwd: string): WizardLang {
  try {
    return detectProjectDocsLang(cwd) === 'pt' ? 'pt' : 'en';
  } catch {
    return 'en';
  }
}

export function catalogFor(lang: WizardLang): Catalog {
  return CATALOGS[lang] ?? CATALOGS.en!;
}
