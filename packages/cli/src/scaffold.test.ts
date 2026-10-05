// @oktis-works/cms - Project Scaffolding Tests (init cria dir nomeado com tudo dentro)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scaffoldProject, installProjectDeps, toPackageName, appRangeFor } from './scaffold.js';
import { DEFAULT_CONFIG_FILENAME } from './project-config.js';
import { DEPLOY_PATHS } from './assets.js';

let workDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'okcms-scaffold-'));
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
});

describe('scaffoldProject', () => {
  it('cria o diretório nomeado e coloca todo o conteúdo dentro dele', async () => {
    await scaffoldProject('cms-teste', 'cms-teste');

    const root = resolve(workDir, 'cms-teste');
    expect(existsSync(root)).toBe(true);

    for (const entry of [
      '.env',
      '.env.example',
      '.gitignore',
      DEFAULT_CONFIG_FILENAME,
      'docker-compose.yml',
      'package.json',
      'README.md',
      'PLUGIN.md',
      'THEME.md',
      'themes',
      'plugins',
      'migrations',
      ...Object.values(DEPLOY_PATHS),
    ]) {
      expect(existsSync(join(root, entry))).toBe(true);
    }

    // nada vazado no diretório pai
    const parentEntries = [
      '.env',
      '.env.example',
      DEFAULT_CONFIG_FILENAME,
      'docker-compose.yml',
      'package.json',
      'README.md',
      'PLUGIN.md',
      'THEME.md',
      'themes',
      'plugins',
      'migrations',
    ];
    for (const entry of parentEntries) {
      expect(existsSync(join(workDir, entry))).toBe(false);
    }

    const config = JSON.parse(readFileSync(join(root, DEFAULT_CONFIG_FILENAME), 'utf-8')) as {
      name: string;
    };
    expect(config.name).toBe('cms-teste');
    // conexão do banco NÃO mora no JSON — fonte única é o .env
    expect(config).not.toHaveProperty('database');

    // .env documenta os DOIS formatos de conexão (DB_* ativo, DATABASE_URL comentado)
    const env = readFileSync(join(root, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_HOST=/m);
    expect(env).toContain('# DATABASE_URL=postgresql://');

    // atalhos executáveis sem CLI global — npm/bun injetam node_modules/.bin
    // no PATH de scripts (`bun run migrate` / `npm run start` funcionam no init)
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['start']).toBe('okcms start');
    expect(pkg.scripts['migrate']).toBe('okcms db:migrate');
    expect(pkg.scripts['doctor']).toBe('okcms doctor');
    expect(pkg.scripts['backup']).toBe('okcms db:backup');
  });

  it('gera README.md, PLUGIN.md e THEME.md com o conteúdo de uso', async () => {
    await scaffoldProject('docs-test', 'docs-test');

    const root = resolve(workDir, 'docs-test');

    // README: título do projeto, sistema, local, Docker e produção
    // (default do init = inglês; a língua NÃO muda o nome do arquivo)
    const readme = readFileSync(join(root, 'README.md'), 'utf-8');
    expect(readme).toContain('# docs-test');
    expect(readme).toContain('What is OkCMS');
    expect(readme).toContain('docker compose up -d');
    expect(readme).toContain('okcms doctor');
    expect(readme).toContain('./PLUGIN.md');
    expect(readme).toContain('./THEME.md');
    expect(readme).toContain('## Production');
    expect(readme).toContain('ecosystem.config.js');
    expect(readme).toContain('pm2 start');
    expect(readme).toContain('WORKER_MODE');
    // a imagem única é o Dockerfile do deploy, não um Dockerfile por app
    expect(readme).toContain('docker/Dockerfile');
    // comandos do quickstart executáveis sem instalação global da CLI
    expect(readme).toContain('npx okcms db:migrate');
    expect(readme).toContain('npx okcms start');
    expect(readme).toContain('bun add -g @oktis-works/cms');
    expect(readme).toContain('bun run migrate');
    // nada de versão pt no scaffold — só existe a língua escolhida
    expect(existsSync(join(root, 'README.pt-BR.md'))).toBe(false);

    // PLUGIN.md: scaffold, manifest e gestão
    const plugin = readFileSync(join(root, 'PLUGIN.md'), 'utf-8');
    expect(plugin).toContain('# Developing a Plugin');
    expect(plugin).toContain('npx okcms plugin:create');
    expect(plugin).toContain('manifest.json');
    expect(plugin).toContain('compatibility');
    expect(plugin).toContain('okcms-plugin');
    // migrations do plugin são documentadas (palco do `okcms redeploy`)
    expect(plugin).toContain('V001__my_plugin__tables.sql');

    // THEME.md: scaffold, build e ativação
    const theme = readFileSync(join(root, 'THEME.md'), 'utf-8');
    expect(theme).toContain('# Developing a Theme');
    expect(theme).toContain('npx okcms theme:create');
    expect(theme).toContain('okcms theme:build');
    expect(theme).toContain('--set-active');
    expect(theme).toContain('okcms-theme');
  });

  it('lang=pt gera as mesmas três docs em português, com os mesmos nomes', async () => {
    await scaffoldProject('docs-pt', 'docs-pt', 'pt');

    const root = resolve(workDir, 'docs-pt');
    const readme = readFileSync(join(root, 'README.md'), 'utf-8');
    expect(readme).toContain('O que é o OkCMS');
    expect(readme).toContain('## Produção');
    expect(readme).toContain('./PLUGIN.md');

    expect(readFileSync(join(root, 'PLUGIN.md'), 'utf-8')).toContain(
      '# Desenvolvendo um Plugin'
    );
    expect(readFileSync(join(root, 'THEME.md'), 'utf-8')).toContain(
      '# Desenvolvendo um Tema'
    );

    // o nome do arquivo é estável em ambas as línguas (só o conteúdo muda)
    expect(existsSync(join(root, 'README.en.md'))).toBe(false);
    expect(existsSync(join(root, 'README.pt-BR.md'))).toBe(false);
  });

  it('next-steps imprime comandos executáveis sem CLI global (npx)', async () => {
    const logged: string[] = [];
    const spy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.join(' '));
      });

    try {
      await scaffoldProject('steps-test', 'steps-test');
    } finally {
      spy.mockRestore();
    }

    const out = logged.join('\n');
    expect(out).toContain('npx okcms db:migrate');
    expect(out).toContain('npx okcms start');
    expect(out).toContain('npx okcms --help');
    expect(out).toContain('bun run migrate');
    // nunca manda rodar `okcms` cru num passo numerado (não está no PATH
    // sem instalação global — era exatamente o bug do "command not found")
    expect(out).not.toMatch(/^\s*\d+\.\s+okcms\s/m);
  });

  it('não sobrescreve README.md já existente no re-init', async () => {
    mkdirSync(join(workDir, 'keep-readme'));
    writeFileSync(join(workDir, 'keep-readme', 'README.md'), '# Meu README editado');

    await scaffoldProject('keep-readme', 'keep-readme');

    expect(readFileSync(join(workDir, 'keep-readme', 'README.md'), 'utf-8')).toBe('# Meu README editado');
    // mas PLUGIN.md/THEME.md (que não existiam) são criados
    expect(existsSync(join(workDir, 'keep-readme', 'PLUGIN.md'))).toBe(true);
    expect(existsSync(join(workDir, 'keep-readme', 'THEME.md'))).toBe(true);
  });

  it('docker-compose sobe postgres + redis com healthcheck e volume', async () => {
    await scaffoldProject('compose-test', 'compose-test');

    const compose = readFileSync(join(workDir, 'compose-test', 'docker-compose.yml'), 'utf-8');
    expect(compose).toContain('image: postgres:16-alpine');
    expect(compose).toContain('image: redis:7-alpine');
    expect(compose).toContain('redis-cli');
    expect(compose).toContain('redisdata');
    expect(compose).toContain('\${REDIS_PORT:-6379}:6379');
  });

  it('.env.example expõe as variáveis de Redis usadas pelo config', async () => {
    await scaffoldProject('env-test', 'env-test');

    const env = readFileSync(join(workDir, 'env-test', '.env.example'), 'utf-8');
    for (const key of ['REDIS_HOST=', 'REDIS_PORT=', 'REDIS_PASSWORD=', 'REDIS_DB=']) {
      expect(env).toContain(key);
    }
    // e o .env já existe pré-configurado
    expect(readFileSync(join(workDir, 'env-test', '.env'), 'utf-8')).toContain('REDIS_HOST=');
  });

  it('package.json sai com apps + worker + CLI local em range tolerante (zero config)', async () => {
    await scaffoldProject('pkg-test', 'pkg-test');

    const pkg = JSON.parse(
      readFileSync(join(workDir, 'pkg-test', 'package.json'), 'utf-8')
    ) as {
      name: string;
      version: string;
      private: boolean;
      dependencies: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const cliPkg = (await import('../package.json', { with: { type: 'json' } })).default as {
      version: string;
    };
    const appRange = appRangeFor(cliPkg.version);
    expect(pkg.name).toBe('pkg-test');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.private).toBe(true);
    expect(pkg.dependencies['@oktis-works/api']).toBe(appRange);
    expect(pkg.dependencies['@oktis-works/admin']).toBe(appRange);
    expect(pkg.dependencies['@oktis-works/web']).toBe(appRange);
    expect(pkg.dependencies['@oktis-works/worker']).toBe(appRange);
    expect(pkg.devDependencies?.['@oktis-works/cms']).toBe(appRange);
    // range nunca é ^versão-exata do CLI — apps independentes podem estar
    // atrás; range exata quebraria o install (ETARGET)
    expect(appRange).not.toBe(`^${cliPkg.version}`);
    // e nunca ^MAJOR.MENOR.0 em 0.x: isso pede o minor inteiro da CLI e
    // explode em ETARGET quando admin/web (ignore do changesets) estão atrás
    if (cliPkg.version.startsWith('0.')) {
      expect(appRange).not.toBe(
        `^${cliPkg.version.split('.').slice(0, 2).join('.')}.0`
      );
    }
  });

  it('não sobrescreve um package.json já existente no diretório', async () => {
    mkdirSync(join(workDir, 'keep'));
    writeFileSync(join(workDir, 'keep', 'package.json'), '{"name":"custom-ja-existente"}');

    await scaffoldProject('keep', 'keep');

    const pkg = JSON.parse(readFileSync(join(workDir, 'keep', 'package.json'), 'utf-8')) as {
      name: string;
    };
    expect(pkg.name).toBe('custom-ja-existente');
  });

  it('appRangeFor: janela de dois minors em 0.x (nunca ETARGET no bump de minor)', () => {
    // CLI 0.2.0 com apps ainda em 0.1.x → o install continua resolvendo
    expect(appRangeFor('0.2.0')).toBe('>=0.1.0 <0.3.0');
    expect(appRangeFor('0.1.14')).toBe('>=0.0.0 <0.2.0');
    expect(appRangeFor('0.0.7')).toBe('>=0.0.0 <0.1.0');
    // a partir de 1.x vira a janela de major inteiro (semântica madura)
    expect(appRangeFor('1.3.0')).toBe('>=1.0.0 <2.0.0');
    // versão ilegível cai no comportamento histórico em vez de quebrar o init
    expect(appRangeFor('canary')).toBe('^canary');
  });

  it('appRangeFor: sempre aceita a própria versão da CLI (o devDep dele)', () => {
    for (const version of ['0.1.14', '0.2.0', '1.0.0']) {
      const range = appRangeFor(version);
      const [major = 0, minor = 0] = version.split('.').map(Number);
      expect(range.startsWith('>=')).toBe(true);
      const upper = range.split('<')[1]!.trim();
      const [uMajor = 0, uMinor = 0] = upper.split('.').map(Number);
      // a faixa cobre MAJOR.MINOR.0 do próprio CLI
      expect(major < uMajor || (major === uMajor && minor < uMinor)).toBe(true);
    }
  });

  it('toPackageName slugifica nomes para npm name válido', () => {
    expect(toPackageName('Meu CMS Teste!')).toBe('meu-cms-teste');
    expect(toPackageName('ok')).toBe('ok');
    expect(toPackageName('***')).toBe('okcms-project');
  });

  it('installProjectDeps roda bun install com cwd no projeto', () => {
    const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
    const spawn = ((cmd: string, args: string[], opts?: { cwd?: string }) => {
      calls.push({ cmd, args, cwd: opts?.cwd });
      return { status: 0, stdout: 'ok', stderr: '' } as never;
    }) as never;

    const root = join(workDir, 'proj');
    const result = installProjectDeps(root, { spawn });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe('bun');
    expect(calls).toEqual([{ cmd: 'bun', args: ['install'], cwd: root }]);
  });

  it('installProjectDeps faz fallback para npm quando o bun não existe', () => {
    const calls: string[] = [];
    const spawn = ((cmd: string, args: string[]) => {
      calls.push([cmd, ...args].join(' '));
      if (cmd === 'bun') {
        return { error: new Error('ENOENT'), status: null, stdout: '', stderr: '' } as never;
      }
      return { status: 0, stdout: 'npm ok', stderr: '' } as never;
    }) as never;

    const result = installProjectDeps(workDir, { spawn });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe('npm');
    expect(calls).toEqual(['bun install', 'npm install']);
  });

  it('installProjectDeps reporta falha sem lançar exceção', () => {
    const spawn = (() => ({ status: 1, stdout: '', stderr: 'registry fora do ar' })) as never;
    const result = installProjectDeps(workDir, { spawn });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('registry fora do ar');
  });
});

describe('scaffold-docs bilíngue', () => {
  it('parseDocsLang aceita as grafias usuais e rejeita lixo', async () => {
    const { parseDocsLang, DEFAULT_DOCS_LANG, DOCS_LANGS } = await import(
      './scaffold-docs.js'
    );

    expect(DOCS_LANGS).toEqual(['en', 'pt']);
    expect(DEFAULT_DOCS_LANG).toBe('en');

    for (const value of ['en', 'EN', 'en-us', 'english', 'Inglês']) {
      expect(parseDocsLang(value)).toBe('en');
    }
    for (const value of ['pt', 'pt-BR', 'PT', 'br', 'português', 'Portuguese']) {
      expect(parseDocsLang(value)).toBe('pt');
    }

    expect(parseDocsLang('')).toBeNull();
    expect(parseDocsLang('   ')).toBeNull();
    expect(parseDocsLang('fr')).toBeNull();
    expect(parseDocsLang(undefined)).toBeNull();
    expect(parseDocsLang(null)).toBeNull();
  });

  it('projeta as três docs nas duas línguas (o arquivo é sempre o mesmo)', async () => {
    const { projectReadme, pluginDoc, themeDoc, docsLangLabel } = await import(
      './scaffold-docs.js'
    );

    const readmeEn = projectReadme('demo');
    const readmePt = projectReadme('demo', 'pt');
    expect(readmeEn).toContain('# demo');
    expect(readmeEn).toContain('What is OkCMS');
    expect(readmePt).toContain('# demo');
    expect(readmePt).toContain('O que é o OkCMS');
    expect(readmeEn).not.toBe(readmePt);

    expect(pluginDoc('en')).toContain('# Developing a Plugin');
    expect(pluginDoc('pt')).toContain('# Desenvolvendo um Plugin');
    expect(themeDoc('en')).toContain('# Developing a Theme');
    expect(themeDoc('pt')).toContain('# Desenvolvendo um Tema');

    // default explícito = inglês (Enter do prompt / CI sem TTY)
    expect(pluginDoc()).toBe(pluginDoc('en'));
    expect(themeDoc()).toBe(themeDoc('en'));

    expect(docsLangLabel('en')).toBe('English');
    expect(docsLangLabel('pt')).toBe('Portuguese');
  });

  it('o comando init expõe --lang (-l) para decidir sem TTY', async () => {
    const { getCommand } = await import('./commands.js');
    const init = getCommand('init');
    const lang = init?.options.find((option) => option.name === 'lang');

    expect(lang).toBeDefined();
    expect(lang?.alias).toBe('l');
    expect(lang?.required).toBe(false);
    expect(lang?.description).toContain('en or pt');
  });
});

describe('mergeGitignore preserva o .gitignore do operador', () => {
  it('acrescenta só o que falta e não toca no que já era do projeto', async () => {
    const root = join(workDir, 'gi-merge');
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, '.gitignore'),
      '# regras minhas\n*.log\n.DS_Store\n.env\n\nmeu-cache/\n',
      'utf-8'
    );

    await scaffoldProject('gi-merge', 'gi-merge');

    const content = readFileSync(join(root, '.gitignore'), 'utf-8');
    // conteúdo do operador intacto (comentários, ordem e regras)
    expect(content).toContain('# regras minhas');
    expect(content).toContain('*.log');
    expect(content).toContain('.DS_Store');
    expect(content).toContain('meu-cache/');
    // o que faltava entrou, sob o header do init
    expect(content).toContain('# okcms init');
    expect(content).toContain('dist/');
    expect(content).toContain('.data/');
    expect(content).toContain('.deploy/');
    expect(content).toContain('docker-compose.override.yml');
    // nada duplicado: .env já existia, e as entradas novas aparecem uma vez
    expect(content.split('\n').filter((line) => line.trim() === '.env')).toHaveLength(1);
    expect(content.split('\n').filter((line) => line.trim() === '.data/')).toHaveLength(1);
    // e a regra original continua antes das novas
    expect(content.indexOf('*.log')).toBeLessThan(content.indexOf('.data/'));
  });

  it('re-init é idempotente: o .gitignore não cresce toda vez', async () => {
    await scaffoldProject('gi-idem', 'gi-idem');
    const path = join(workDir, 'gi-idem', '.gitignore');
    const first = readFileSync(path, 'utf-8');
    expect(first).toContain('# OkCMS');

    await scaffoldProject('gi-idem', 'gi-idem');
    expect(readFileSync(path, 'utf-8')).toBe(first);
  });

  it('sem .gitignore existente cria o arquivo com as entradas do deploy', async () => {
    await scaffoldProject('gi-new', 'gi-new');
    const content = readFileSync(join(workDir, 'gi-new', '.gitignore'), 'utf-8');

    expect(content.startsWith('# OkCMS\n')).toBe(true);
    for (const entry of ['.env', 'node_modules/', 'dist/', '.deploy/']) {
      expect(content).toContain(entry);
    }
  });
});
