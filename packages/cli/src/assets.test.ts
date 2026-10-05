// @oktis-works/cms - Assets de deploy canônicos (F2)
//
// A regra central: o que a CLI escreve no projeto do operador e o que está
// em `infrastructure/**` são o MESMO arquivo. Se divergirem, quem seguiu o
// guia de deploy sem a CLI passa a rodar outra coisa.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import {
  ASSET_MIRROR,
  COMPOSE_DEPLOY,
  COMPOSE_INFRA,
  DEFAULT_UPSTREAM_PORTS,
  DEPLOY_PATHS,
  DOCKERFILE,
  DOCKERIGNORE,
  ENTRYPOINT_SH,
  NGINX_GENERATED,
  NGINX_TEMPLATE,
  deployAssets,
  portsFromEnv,
  renderUpstreams,
} from './assets.js';
import { parseComposeServices, classifyServices } from './docker.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf-8');

/**
 * Bloco de um serviço, delimitado pela próxima chave de nível 2 (ou pelo fim
 * do documento). Os `service:` internos têm indent >= 4 e ficam de fora.
 */
function serviceBlock(yaml: string, name: string): string {
  const lines = yaml.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  if (start < 0) return '';
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    if (/^ {2}[\w.-]+:\s*$/.test(line) || /^\S/.test(line)) break;
    end += 1;
  }
  return lines.slice(start, end).join('\n');
}

describe('espelhos infrastructure/**', () => {
  const mirrors: Array<[keyof typeof ASSET_MIRROR, string]> = [
    ['dockerfile', DOCKERFILE],
    ['entrypoint', ENTRYPOINT_SH],
    ['dockerignore', DOCKERIGNORE],
    ['composeInfra', COMPOSE_INFRA],
    ['composeDeploy', COMPOSE_DEPLOY],
    ['nginxTemplate', NGINX_TEMPLATE],
  ];

  for (const [key, content] of mirrors) {
    it(`${ASSET_MIRROR[key]} bate byte a byte com assets.ts`, () => {
      expect(read(ASSET_MIRROR[key])).toBe(content);
    });
  }

  it('o entrypoint espelhado é executável', () => {
    expect(statSync(join(ROOT, ASSET_MIRROR.entrypoint)).mode & 0o111).not.toBe(0);
  });
});

describe('deployAssets()', () => {
  it('produz todos os arquivos, com entrypoint executável', () => {
    const assets = deployAssets();
    const paths = assets.map((asset) => asset.path);

    expect(paths).toContain(DEPLOY_PATHS.dockerfile);
    expect(paths).toContain(DEPLOY_PATHS.entrypoint);
    expect(paths).toContain(DEPLOY_PATHS.dockerignore);
    expect(paths).toContain(DEPLOY_PATHS.composeInfra);
    expect(paths).toContain(DEPLOY_PATHS.composeDeploy);
    expect(paths).toContain(DEPLOY_PATHS.nginxTemplate);
    expect(paths).toContain(DEPLOY_PATHS.nginxUpstreams);

    const entrypoint = assets.find((asset) => asset.path === DEPLOY_PATHS.entrypoint);
    expect(entrypoint?.mode).toBe(0o755);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('a lane inicial do upstream segue o parâmetro', () => {
    expect(deployAssets('green').find((a) => a.path === DEPLOY_PATHS.nginxUpstreams)?.content).toContain(
      'okcms-api-green'
    );
    expect(deployAssets('blue').find((a) => a.path === DEPLOY_PATHS.nginxUpstreams)?.content).toContain(
      'okcms-api-blue'
    );
  });
});

// ---------------------------------------------------------------------------

describe('Dockerfile', () => {
  it('não embarca a CLI (sem executor de deploy dentro do container)', () => {
    // a CLI é o alvo valioso: instala pacotes e lê .env — nunca dentro da imagem
    expect(DOCKERFILE).not.toContain('@oktis-works/cms');
    expect(ENTRYPOINT_SH).not.toContain('@oktis-works/cms');
    const cliInvocation = /\bokcms\s+(config|update|init|deploy|db:|plugin)/;
    expect(DOCKERFILE).not.toMatch(cliInvocation);
    expect(ENTRYPOINT_SH).not.toMatch(cliInvocation);
    expect(DOCKERFILE).not.toContain('bun add');
  });

  it('só instala dependências de produção', () => {
    // primeira linha é a que roda; as demais são fallback de versão/lock
    expect(DOCKERFILE).toContain('bun install --production --frozen-lockfile');
    expect(DOCKERFILE).not.toMatch(/^\s*RUN bun install\s*$/m);
  });

  it('node_modules vem do estágio de deps, nunca do host', () => {
    expect(DOCKERFILE).toContain('COPY --from=deps /app/node_modules ./node_modules');
    expect(DOCKERFILE).toContain('COPY . .');
    // deps antes do código: trocar só o código não re-instala tudo
    expect(DOCKERFILE.indexOf('COPY . .')).toBeGreaterThan(DOCKERFILE.indexOf('bun install'));
  });

  it('declara os quatro entrypoints e usa ENTRYPOINT/CMD', () => {
    expect(ENTRYPOINT_SH).toContain('api)');
    expect(ENTRYPOINT_SH).toContain('web)');
    expect(ENTRYPOINT_SH).toContain('admin)');
    expect(ENTRYPOINT_SH).toContain('worker)');
    expect(ENTRYPOINT_SH).toContain('set -eu');
    expect(DOCKERFILE).toContain('ENTRYPOINT ["/app/docker/entrypoint.sh"]');
    expect(DOCKERFILE).toContain('CMD ["api"]');
  });
});

describe('.dockerignore', () => {
  it('o .env real nunca entra na imagem', () => {
    expect(DOCKERIGNORE).toMatch(/^\.env$/m);
    expect(DOCKERIGNORE).toMatch(/^\.env\.\*$/m);
    // mas o exemplo continua útil dentro da imagem
    expect(DOCKERIGNORE).toContain('!.env.example');
  });

  it('node_modules do host fica de fora', () => {
    expect(DOCKERIGNORE).toMatch(/^node_modules$/m);
    expect(DOCKERIGNORE).toMatch(/^\*\*\/node_modules$/m);
  });

  it('NÃO ignora dist/ — plugin publicado roda do dist', () => {
    expect(DOCKERIGNORE).not.toMatch(/^dist$/m);
    expect(DOCKERIGNORE).not.toMatch(/^\*\*\/dist$/m);
  });

  it('.data, logs e deploy montado ficam de fora', () => {
    expect(DOCKERIGNORE).toMatch(/^\.data$/m);
    expect(DOCKERIGNORE).toMatch(/^deploy\/$/m);
  });
});

// ---------------------------------------------------------------------------

describe('docker-compose.infra.yml', () => {
  it('é parseável e classifica os papéis', () => {
    const services = parseComposeServices(COMPOSE_INFRA);
    const roles = Object.fromEntries(services.map((s) => [s.name, s.role]));

    expect(roles['postgres']).toBe('data');
    expect(roles['redis']).toBe('data');
    expect(roles['proxy']).toBe('proxy');
  });

  it('NÃO publica redis na rede do host', () => {
    expect(serviceBlock(COMPOSE_INFRA, 'redis')).not.toMatch(/ports:/);
  });

  it('postgres só em loopback (migração/backup no host sem expor a rede)', () => {
    expect(serviceBlock(COMPOSE_INFRA, 'postgres')).toContain('127.0.0.1:${DB_HOST_PORT:-5432}:5432');
    expect(serviceBlock(COMPOSE_INFRA, 'postgres')).not.toMatch(/^\s+- "?\d+:\d+"?\s*$/m);
  });

  it('sem montar docker.sock (escalação para root do host)', () => {
    expect(COMPOSE_INFRA).not.toContain('docker.sock');
    expect(COMPOSE_DEPLOY).not.toContain('docker.sock');
    expect(DOCKERFILE).not.toContain('docker.sock');
  });

  it('cria a rede okcms-net com nome fixo para as lanes', () => {
    expect(COMPOSE_INFRA).toContain('name: okcms-net');
    expect(COMPOSE_DEPLOY).toContain('name: okcms-net');
    expect(COMPOSE_DEPLOY).toContain('external: true');
  });

  it('proxy é o ÚNICO serviço com porta pública de verdade', () => {
    // mapeamento sem IP explícito = exposto em todas as interfaces
    const withPublicPorts = ['postgres', 'redis', 'proxy'].filter((name) =>
      /^\s+- "?\d+:\d+"?\s*$/m.test(serviceBlock(COMPOSE_INFRA, name))
    );
    expect(withPublicPorts).toEqual(['proxy']);

    const proxyBlock = serviceBlock(COMPOSE_INFRA, 'proxy');
    expect(proxyBlock).toContain('"80:80"');
    expect(proxyBlock).toContain('"8080:8080"');
    // postgres só em loopback (cima); redis nenhuma
    expect(serviceBlock(COMPOSE_INFRA, 'postgres')).toMatch(/^\s+- "127\.0\.0\.1:/m);
  });
});

describe('docker-compose.deploy.yml', () => {
  it('monta as 8 services com container_name determinístico', () => {
    const services = parseComposeServices(COMPOSE_DEPLOY);
    expect(services).toHaveLength(8);

    const names = services.map((service) => service.containerName).sort();
    expect(names).toEqual([
      'okcms-admin-blue',
      'okcms-admin-green',
      'okcms-api-blue',
      'okcms-api-green',
      'okcms-web-blue',
      'okcms-web-green',
      'okcms-worker-blue',
      'okcms-worker-green',
    ]);
  });

  it('edge e worker separados por label — é o que o wizard drena', () => {
    const services = parseComposeServices(COMPOSE_DEPLOY);

    const edge = services.filter((service) => service.role === 'edge');
    const worker = services.filter((service) => service.role === 'worker');

    expect(edge.map((service) => service.name).sort()).toEqual([
      'admin-blue',
      'admin-green',
      'api-blue',
      'api-green',
      'web-blue',
      'web-green',
    ]);
    expect(worker.map((service) => service.name).sort()).toEqual(['worker-blue', 'worker-green']);
    expect(worker.every((service) => service.lane !== null)).toBe(true);
  });

  it('classifyServices separa o que é intocável do que é lane', () => {
    const all = [...parseComposeServices(COMPOSE_DEPLOY), ...parseComposeServices(COMPOSE_INFRA)];
    const result = classifyServices(all, 'blue');

    expect(result.edge.map((service) => service.name).sort()).toEqual([
      'admin-blue',
      'api-blue',
      'web-blue',
    ]);
    expect(result.worker.map((service) => service.name)).toEqual(['worker-blue']);
    expect(result.untouched.map((service) => service.name).sort()).toEqual([
      'postgres',
      'proxy',
      'redis',
    ]);
  });

  it('NÃO declara depends_on dos serviços de infra (projetos separados)', () => {
    expect(COMPOSE_DEPLOY).not.toContain('depends_on');
  });

  it('nenhum serviço de lane publica porta no host', () => {
    expect(COMPOSE_DEPLOY).not.toMatch(/\n\s{2}ports:/);
    expect(COMPOSE_DEPLOY).not.toContain('80:80');
    expect(COMPOSE_DEPLOY).not.toContain('5432');
  });

  it('worker tem stop_grace_period para drenar com SIGTERM', () => {
    expect(COMPOSE_DEPLOY).toMatch(/worker-blue:[\s\S]*?stop_grace_period: 30s/);
    expect(COMPOSE_DEPLOY).toMatch(/worker-green:[\s\S]*?stop_grace_period: 30s/);
  });

  it('mídia compartilhada entre lanes (deploy não perde arquivo)', () => {
    expect(COMPOSE_DEPLOY).toContain('name: okcms-storage');
    expect(COMPOSE_DEPLOY).toContain('/app/.data/storage');
    // documentado: o down de lane NUNCA pode passar -v
    expect(COMPOSE_DEPLOY).toContain('never passes -v');
  });

  it('admin sobrescreve PORT (astro standalone lê PORT, não ADMIN_PORT)', () => {
    expect(COMPOSE_DEPLOY).toMatch(/admin-blue:[\s\S]*?PORT: \$\{ADMIN_PORT:-3011\}/);
    expect(COMPOSE_DEPLOY).toMatch(/admin-green:[\s\S]*?PORT: \$\{ADMIN_PORT:-3011\}/);
  });

  it('build aponta para o Dockerfile gerado pelo scaffold', () => {
    expect(COMPOSE_DEPLOY).toContain('dockerfile: docker/Dockerfile');
    expect(COMPOSE_DEPLOY).toContain('image: okcms/app:${OKCMS_VERSION:-latest}');
  });
});

// ---------------------------------------------------------------------------

describe('nginx', () => {
  it('template existe no caminho que o entrypoint do nginx espera', () => {
    expect(DEPLOY_PATHS.nginxTemplate).toBe('deploy/nginx/templates/default.conf.template');
    expect(existsSync(join(ROOT, 'infrastructure/nginx/templates/default.conf.template'))).toBe(true);
  });

  it('separa site público, admin por host e admin por porta', () => {
    expect(NGINX_TEMPLATE).toContain('listen 80 default_server');
    expect(NGINX_TEMPLATE).toContain('server_name ${ADMIN_SERVER_NAME}');
    expect(NGINX_TEMPLATE).toContain('listen 8080 default_server');
    expect(NGINX_TEMPLATE).toContain('server_name ${SERVER_NAME}');
  });

  it('cobre api, mídia, temas e site público', () => {
    expect(NGINX_TEMPLATE).toContain('location /api/');
    expect(NGINX_TEMPLATE).toContain('location /storage/');
    expect(NGINX_TEMPLATE).toContain('location /themes/');
    expect(NGINX_TEMPLATE).toContain('location = /health');
    expect(NGINX_TEMPLATE).toContain('proxy_pass $upstream_web');
  });

  it('reescreve /storage para a rota real de mídia da API', () => {
    expect(NGINX_TEMPLATE).toContain('rewrite ^/storage/(.*)$ /api/v1/media/file/$1 break');
  });

  it('só substitui variáveis de ambiente — $host e $upstream_* intactos', () => {
    // o envsubst do nginx recebe a lista de env vars; fora dela nada muda
    expect(NGINX_TEMPLATE).toContain('${ADMIN_SERVER_NAME}');
    expect(NGINX_TEMPLATE).toContain('${SERVER_NAME}');
    expect(NGINX_TEMPLATE).toContain('$upstream_api');
    expect(NGINX_TEMPLATE).toContain('$upstream_admin');
    expect(NGINX_TEMPLATE).toContain('$connection_upgrade');
  });

  it('o arquivo gerado no start fica fora do git', () => {
    expect(NGINX_GENERATED).toBe('deploy/nginx/conf.d/default.conf');
  });
});

describe('renderUpstreams()', () => {
  it('troca só os alvos quando o lane muda', () => {
    const blue = renderUpstreams('blue');
    const green = renderUpstreams('green');

    expect(blue).toContain('http://okcms-api-blue:3000');
    expect(green).toContain('http://okcms-api-green:3000');
    // fora dos três alvos, o arquivo é idêntico → swap de 3 linhas
    const strip = (text: string): string =>
      text.replace(/http:\/\/okcms-(api|web|admin)-(blue|green):\d+/g, 'URL');
    expect(strip(blue)).toBe(strip(green));
  });

  it('usa as portas reais do .env', () => {
    const text = renderUpstreams('blue', { api: 4000, web: 4001, admin: 4002 });
    expect(text).toContain('http://okcms-api-blue:4000');
    expect(text).toContain('http://okcms-web-blue:4001');
    expect(text).toContain('http://okcms-admin-blue:4002');
  });

  it('não é template de envsubst (sem ${...} de shell)', () => {
    // um ${ errado no conf.d faria o nginx subir com upstream literali quebrado
    expect(renderUpstreams('blue')).not.toContain('${');
  });

  it('porta inválida do .env cai no default do app', () => {
    expect(portsFromEnv({})).toEqual(DEFAULT_UPSTREAM_PORTS);
    expect(portsFromEnv({ PORT: 'abc' }).api).toBe(DEFAULT_UPSTREAM_PORTS.api);
    expect(portsFromEnv({ PORT: '8080' }).api).toBe(8080);
    expect(portsFromEnv({ WEB_PORT: '99999' }).web).toBe(DEFAULT_UPSTREAM_PORTS.web);
  });
});
