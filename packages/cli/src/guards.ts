// @oktis-works/cms - Guardas de segurança da CLI
//
// A CLI não abre porta nenhuma: a superfície de rede dela é ZERO. O risco
// real é ela rodar DENTRO de um container comprometido — aí `okcms update`
// vira um executor de `bun add` (scripts de pós-install de terceiros) dentro
// da rede do banco, com o `.env` na mão. Estas funções transformam essa
// análise em checagens executáveis.
//
// Regras:
//   1. comandos destrutivos/deploy recusam rodar em container (--force escapa);
//   2. o tráfego de rede da CLI é limitado ao registry npm oficial;
//   3. nenhum compose de produção monta /var/run/docker.sock;
//   4. segredos nunca aparecem em log/stdout.

import { existsSync, readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// 1. Detecção de container
// ---------------------------------------------------------------------------

export interface ContainerProbe {
  /** Existência de arquivo (padrão: fs.existsSync). */
  exists?: (path: string) => boolean;
  env?: NodeJS.ProcessEnv;
  /** Conteúdo de /proc/1/cgroup (padrão: fs.readFileSync). */
  cgroup?: string | null;
}

/** Marca `OKCMS_IN_CONTAINER=1` também detecta o caso de CLI montada à mão. */
const CONTAINER_ENV = 'OKCMS_IN_CONTAINER';

function readCgroup(exists: (p: string) => boolean): string | null {
  const path = '/proc/1/cgroup';
  if (!exists(path)) return null;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export function isInContainer(probe: ContainerProbe = {}): boolean {
  const exists = probe.exists ?? existsSync;
  const env = probe.env ?? process.env;

  if (env[CONTAINER_ENV] === '1' || env[CONTAINER_ENV] === 'true') return true;

  // Marcadores canônicos de runtime
  if (exists('/.dockerenv')) return true;
  if (exists('/run/.containerenv')) return true; // podman

  const cgroup = probe.cgroup !== undefined ? probe.cgroup : readCgroup(exists);
  if (cgroup && /docker|lxc|kubepods|containerd|podman|cri-o|nomad/i.test(cgroup)) {
    return true;
  }

  // /proc/self/cgroup do processo (quando /proc/1/cgroup não é legível)
  if (!cgroup) {
    const own = probe.cgroup === undefined ? readCgroupWeird(exists) : null;
    if (own && /docker|lxc|kubepods|containerd|podman/i.test(own)) return true;
  }

  return false;
}

function readCgroupWeird(exists: (p: string) => boolean): string | null {
  const path = '/proc/self/cgroup';
  if (!exists(path)) return null;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export interface GuardResult {
  ok: boolean;
  /** Mensagem pronta para `console.error` quando `ok === false`. */
  message: string;
}

/**
 * Bloqueia comandos que alteram estado fora do host quando a CLI roda dentro
 * de um container. `force` (=`--force`) é o escape consciente — registrado em
 * log para auditoria.
 */
export function assertHostOnly(
  command: string,
  opts: { force?: boolean; probe?: ContainerProbe } = {}
): GuardResult {
  if (opts.force) return { ok: true, message: '' };
  if (!isInContainer(opts.probe ?? {})) return { ok: true, message: '' };

  return {
    ok: false,
    message:
      `${command} refused to run inside a container.\n` +
      `  The deploy/config CLI only runs on the HOST — inside a container it would become\n` +
      `  a \`bun add\` executor on the database network with the .env exposed.\n` +
      `  Run it on the host: \`docker exec -it <host-container> ${command}\` or use --force.`,
  };
}

// ---------------------------------------------------------------------------
// 2. Allowlist de rede
// ---------------------------------------------------------------------------

/** Único destino que a CLI fala sem configuração explícita. */
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export function registryAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const extra = env['OKCMS_NPM_REGISTRY'];
  return extra ? [DEFAULT_REGISTRY, extra] : [DEFAULT_REGISTRY];
}

export function isUrlAllowed(url: string, allowlist: string[] = registryAllowlist()): boolean {
  return allowlist.some((base) => url === base || url.startsWith(`${base}/`));
}

export function assertUrlAllowed(
  url: string,
  allowlist: string[] = registryAllowlist()
): GuardResult {
  if (isUrlAllowed(url, allowlist)) return { ok: true, message: '' };
  return {
    ok: false,
    message: `URL outside the CLI allowlist: ${redact(url)}\n  Allowed: ${allowlist.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// 3. Compose: socket do Docker é escalação de privilégio
// ---------------------------------------------------------------------------

const SOCKET_MOUNT = /docker\.sock/i;

/** true se algum serviço monta o socket do Docker (via short ou long syntax). */
export function hasDockerSocketMount(composeText: string): boolean {
  return SOCKET_MOUNT.test(composeText);
}

export function assertNoDockerSocket(composeText: string): GuardResult {
  if (!hasDockerSocketMount(composeText)) return { ok: true, message: '' };
  return {
    ok: false,
    message:
      'The compose file mounts /var/run/docker.sock in an application container.\n' +
      '  That is direct escalation to host root: any RCE in the app becomes root.\n' +
      '  Remove the bind mount; if a service needs the daemon, use a dedicated proxy.',
  };
}

// ---------------------------------------------------------------------------
// 4. Redação de segredos em log
// ---------------------------------------------------------------------------

const SENSITIVE_KEY = /(PASS|PASSWORD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIAL|DSN|DATABASE_URL|JWT)/i;

/** URIs com credencial: `postgres://user:senha@host` → `postgres://user:***@host`. */
function redactUrls(text: string): string {
  return text.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^:/\s@]+):([^/\s@]+)@/gi,
    (_all, scheme: string, user: string) => `${scheme}${user}:***@`
  );
}

/** `KEY=valor` sensível → `KEY=***`. */
function redactAssignments(text: string): string {
  return text.replace(
    /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)([ \t]*=[ \t]*)(.*)$/gm,
    (line, key: string, sep: string, value: string) => {
      if (!SENSITIVE_KEY.test(key)) return line;
      if (!value || value === '***') return `${key}${sep}***`;
      return `${key}${sep}***`;
    }
  );
}

/**
 * Aplica redação a QUALQUER texto de log da CLI. Chamado pelas mensagens de
 * erro de `update`/`config` para nunca vazar senha em CI ou em issue de suporte.
 */
export function redact(text: string): string {
  return redactAssignments(redactUrls(text));
}

/** true se o valor parece um segredo de verdade (não vazio, não placeholder). */
export function looksLikeSecret(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  return !/^(change-?me|dev-?secret|placeholder|example|changeme)/i.test(trimmed);
}

/** Gera um segredo forte (JWT_SECRET / cookie key) sem dependência externa. */
export function generateSecret(length = 48): string {
  // import dinâmico barato: só roda quando realmente precisamos gerar
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}
