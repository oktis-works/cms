// @oktis-works/core - Theme Service Tests (ciclo de vida + descoberta)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CMS_VERSION } from '@oktis-works/validation';

type Row = Record<string, unknown>;
let queue: Row[][];
let lastQuery: { text: string; values: unknown[] } | null;
const allQueries: Array<{ text: string; values: unknown[] }> = [];

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      lastQuery = { text, values: values ?? [] };
      allQueries.push(lastQuery);
      if (queue.length > 0) return queue.shift();
      return [];
    }),
  })),
}));

vi.mock('@oktis-works/validation', () => ({
  CMS_VERSION: '0.36.0',
  checkExtensionCompatibility: vi.fn((type, manifest) => {
    const issues: Array<{ message: string }> = [];
    if (!manifest.type) issues.push({ message: 'Missing type' });
    if (!manifest.compatibility?.okcms) issues.push({ message: 'Missing compatibility.okcms' });
    return issues;
  }),
}));

// Descoberta de diretório: readdir/readFile dirigidos por variáveis de teste.
let readdirImpl: () => Promise<unknown[]>;
let readFileImpl: (path: string) => Promise<string>;

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(async () => readdirImpl()),
  readFile: vi.fn(async (path: string) => readFileImpl(path))
}))

vi.mock('../extensions/project-directories.js', () => ({
  resolveExtensionDirectory: vi.fn(() => '/projeto/themes'),
}));

import { ThemeService } from './service.js';

const themeRow = (overrides: Row = {}): Row => ({
  id: 'id-1',
  name: 'meu-tema',
  version: '1.0.0',
  status: 'INSTALLED',
  manifest: { 
    name: 'meu-tema', 
    version: '1.0.0',
    settings: [
      { name: 'siteTitle', type: 'text', label: 'Site Title', default: 'Meu Site' },
      { name: 'siteDescription', type: 'text', label: 'Site Description', default: '' }
    ]
  },
  config: {},
  ...overrides,
});

beforeEach(() => {
  queue = [];
  lastQuery = null;
  allQueries.length = 0;
  readdirImpl = async () => [];
  readFileImpl = async () => {
    throw new Error('ENOENT');
  };
});

describe('ThemeService.syncFromDirectory', () => {
  it('descobre theme.json e faz upsert com updated_at', async () => {
    readdirImpl = async () => [{ isDirectory: () => true, name: 'meu-tema' }];
    readFileImpl = async (path) => {
      if (path.endsWith('theme.json')) {
        return JSON.stringify({ name: 'meu-tema', version: '2.0.0' });
      }
      throw new Error('ENOENT');
    };
    // getByName (vazio) → INSERT → list
    queue = [[], [], [themeRow({ version: '2.0.0' })]];

    const result = await new ThemeService().syncFromDirectory();

    const insert = allQueries.find((q) => q.text.includes('INSERT INTO themes'));
    expect(insert).toBeDefined();
    expect(insert!.text).toContain('installed_at');
    expect(insert!.text).toContain('updated_at');
    expect(result).toHaveLength(1);
  });

  it('NÃO descobre manifesto no nome legado manifest.json (unificação: theme.json é o canônico)', async () => {
    readdirImpl = async () => [{ isDirectory: () => true, name: 'default' }];
    readFileImpl = async (path) => {
      if (path.endsWith('manifest.json')) {
        return JSON.stringify({ name: 'default', version: '0.1.0' });
      }
      throw new Error('ENOENT');
    };
    queue = [[themeRow({ name: 'default' })]];

    const result = await new ThemeService().syncFromDirectory();

    // sem theme.json o tema não é descoberto — a migração é dos entry points
    // do CLI (theme-migrate.ts), não do service
    expect(allQueries.some((q) => q.text.includes('INSERT INTO themes') || q.text.includes('UPDATE'))).toBe(false);
    expect(result).toHaveLength(1); // estado do banco intacto
  });

  it('sem diretório retorna o estado do banco (não esconde linhas)', async () => {
    readdirImpl = async () => {
      throw new Error('ENOENT');
    };
    queue = [[themeRow()]];

    const result = await new ThemeService().syncFromDirectory();

    expect(result).toHaveLength(1);
    expect(lastQuery!.text).toContain('FROM themes');
  });

  it('lista completa mesmo com diretório vazio (tema removido do disco fica desinstalável)', async () => {
    readdirImpl = async () => [];
    queue = [[themeRow()]];

    const result = await new ThemeService().syncFromDirectory();

    expect(result).toHaveLength(1);
    expect(lastQuery!.text).toContain('FROM themes');
  });
});

describe('ThemeService.install', () => {
  const validManifest = {
    name: 'novo-tema',
    version: '1.0.0',
    type: 'theme',
    compatibility: { okcms: `^${CMS_VERSION}` },
  };

  it('rejeita nome inseguro', async () => {
    await expect(
      new ThemeService().install({ name: '../fora', version: '1.0.0', manifest: validManifest })
    ).rejects.toThrow(/Invalid theme name/);
    expect(allQueries).toHaveLength(0);
  });

  it('rejeita manifesto sem type/compatibility (contrato BUSI-022)', async () => {
    await expect(
      new ThemeService().install({
        name: 'novo-tema',
        version: '1.0.0',
        manifest: { name: 'novo-tema', version: '1.0.0' },
      })
    ).rejects.toThrow(/Invalid theme manifest/);
  });

  it('rejeita nome já instalado (unicidade)', async () => {
    queue = [[themeRow({ name: 'novo-tema' })]];

    await expect(
      new ThemeService().install({ name: 'novo-tema', version: '1.0.0', manifest: validManifest })
    ).rejects.toThrow(/already installed/);
  });

  it('instala como INSTALLED com installed_at + updated_at', async () => {
    queue = [
      [], // getByName → vazio
      [themeRow({ status: 'INSTALLED' })], // INSERT RETURNING
    ];

    const result = await new ThemeService().install({
      name: 'novo-tema',
      version: '1.0.0',
      manifest: validManifest,
    });

    const insert = allQueries.find((q) => q.text.includes('INSERT INTO themes'))!;
    expect(insert.text).toContain("'INSTALLED'");
    expect(insert.text).toContain('installed_at');
    expect(insert.text).toContain('updated_at');
    expect(result.status).toBe('INSTALLED');
  });
});

describe('ThemeService.activate / deactivate', () => {
  it('activate devolve null sem tocar no banco quando o id não existe', async () => {
    queue = [[]];

    const result = await new ThemeService().activate('fantasma');

    expect(result).toBeNull();
    expect(allQueries).toHaveLength(1); // só o getById
    expect(allQueries[0]!.text).toContain('SELECT * FROM themes WHERE id');
  });

  it('activate desativa os demais antes de ativar o alvo (um único ACTIVE)', async () => {
    queue = [
      [themeRow()], // getById
      [], // UPDATE dos demais ACTIVE
      [themeRow({ status: 'ACTIVE' })], // UPDATE do alvo RETURNING
    ];

    const result = await new ThemeService().activate('id-1');

    const deactivateOthers = allQueries.find(
      (q) => q.text.includes("SET status = 'INACTIVE'") && q.text.includes('id <> $1')
    );
    expect(deactivateOthers).toBeDefined();

    const activateTarget = allQueries.find((q) => q.text.includes("SET status = 'ACTIVE'"))!;
    expect(activateTarget.text).toContain('activated_at');
    expect(activateTarget.text).toContain('updated_at');

    expect(result!.status).toBe('ACTIVE');
  });

  it('deactivate usa updated_at e NÃO a coluna inexistente deactivated_at', async () => {
    queue = [
      [themeRow({ status: 'ACTIVE' })],
      [{ count: 2 }], // guard: more than one theme registered
      [themeRow({ status: 'INACTIVE' })],
    ];

    const result = await new ThemeService().deactivate('id-1');

    const update = allQueries.find((q) => q.text.includes('UPDATE themes'))!;
    expect(update.text).toContain('updated_at');
    expect(update.text).not.toContain('deactivated_at');
    expect(result!.status).toBe('INACTIVE');
  });

  it('deactivate devolve null para id inexistente', async () => {
    queue = [[]];
    expect(await new ThemeService().deactivate('fantasma')).toBeNull();
  });

  it('deactivate refuses when it is the only theme (an active theme must always remain)', async () => {
    queue = [
      [themeRow({ status: 'ACTIVE' })],
      [{ count: 1 }], // only theme registered
    ];

    await expect(new ThemeService().deactivate('id-1')).rejects.toThrow(
      /at least one active theme is required/i
    );
    // No UPDATE may run when the guard blocks the deactivation.
    expect(allQueries.some((q) => q.text.includes('UPDATE themes'))).toBe(false);
  });
});

describe('ThemeService.getActive', () => {
  it('ordena por activated_at DESC (tema ativo mais recente)', async () => {
    queue = [[themeRow({ status: 'ACTIVE' })]];

    const result = await new ThemeService().getActive();

    expect(lastQuery!.text).toContain('ORDER BY activated_at DESC');
    expect(lastQuery!.values).toEqual([]);
    expect(result!.status).toBe('ACTIVE');
  });
});

describe('ThemeService.updateConfig', () => {
  it('rejeita config que não é objeto', async () => {
    await expect(new ThemeService().updateConfig('id-1', 'nope')).rejects.toThrow(
      /must be an object/
    );
  });

  it('devolve null quando o tema não existe', async () => {
    queue = [[]];
    expect(await new ThemeService().updateConfig('fantasma', {})).toBeNull();
  });

  it('grava config como jsonb com updated_at', async () => {
    queue = [
      [themeRow()], // SELECT getById
      [], // INSERT INTO theme_config_versions
      [themeRow({ config: { siteTitle: 'Meu site' } })], // UPDATE RETURNING
    ];

    const result = await new ThemeService().updateConfig('id-1', { siteTitle: 'Meu site' });

    const update = allQueries.find((q) => q.text.includes('SET config'))!;
    expect(update.text).toContain('::jsonb');
    expect(update.text).toContain('updated_at');
    expect(result!.config).toEqual({ siteTitle: 'Meu site' });
  });
});

describe('ThemeService.uninstall', () => {
  it('devolve false para id inexistente (a rota responde 404)', async () => {
    queue = [[]];
    expect(await new ThemeService().uninstall('fantasma')).toBe(false);
  });

  it('remove o tema existente', async () => {
    queue = [[themeRow()], []];
    expect(await new ThemeService().uninstall('id-1')).toBe(true);
    expect(allQueries.some((q) => q.text.includes('DELETE FROM themes'))).toBe(true);
  });
});

describe('ThemeService.exportConfig', () => {
  it('exporta config e manifest do tema', async () => {
    queue = [[themeRow({ config: { siteTitle: 'Teste' } })]];
    const result = await new ThemeService().exportConfig('id-1');
    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ siteTitle: 'Teste' });
    expect(result!.manifest).toBeDefined();
    expect(result!.exportedAt).toBeDefined();
  });

  it('devolve null para tema inexistente', async () => {
    queue = [[]];
    const result = await new ThemeService().exportConfig('fantasma');
    expect(result).toBeNull();
  });
});

describe('ThemeService.importConfig', () => {
  it('importa config no modo merge (atualiza apenas campos conhecidos)', async () => {
    queue = [
      [themeRow({ config: { siteTitle: 'Old Title' } })], // getById in importConfig
      [themeRow({ config: { siteTitle: 'Old Title' } })], // getById in updateConfig
      [], // INSERT INTO theme_config_versions
      [themeRow({ config: { siteTitle: 'New Title' } })], // UPDATE RETURNING
    ];

    const result = await new ThemeService().importConfig('id-1', { siteTitle: 'New Title' }, { mode: 'merge' });
    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ siteTitle: 'New Title' });
  });

  it('importa config no modo replace (permite chaves extras)', async () => {
    queue = [
      [themeRow({ config: { siteTitle: 'Old Title' } })], // getById in importConfig
      [themeRow({ config: { siteTitle: 'Old Title' } })], // getById in updateConfig
      [], // INSERT INTO theme_config_versions
      [themeRow({ config: { siteTitle: 'New Title', customKey: 'customValue' } })], // UPDATE RETURNING
    ];
    const result = await new ThemeService().importConfig('id-1', { siteTitle: 'New Title', customKey: 'customValue' }, { mode: 'replace' });
    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ siteTitle: 'New Title', customKey: 'customValue' });
  });

  it('rejeita config inválida', async () => {
    queue = [[themeRow()]];
    await expect(new ThemeService().importConfig('id-1', { invalidKey: 'value' })).rejects.toThrow(/Theme config validation failed/);
  });
});

describe('ThemeService.getConfigHistory', () => {
  it('retorna histórico vazio para tema sem versões', async () => {
    queue = [[], []]; // theme row, empty history
    const history = await new ThemeService().getConfigHistory('id-1');
    expect(history).toEqual([]);
  });
});

describe('ThemeService.restoreConfigVersion', () => {
  it('restaura versão anterior', async () => {
    queue = [
      [themeRow()], // getById
      [{ id: 'ver-1', config: { restored: true } }], // getConfigHistory
      [], // INSERT history
      [themeRow({ config: { restored: true } })], // UPDATE
    ];
    const result = await new ThemeService().restoreConfigVersion('id-1', 'ver-1', 'user-1');
    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ restored: true });
  });

  it('devolve null para versão inexistente', async () => {
    queue = [[themeRow()], []];
    const result = await new ThemeService().restoreConfigVersion('id-1', 'ver-inexistente', 'user-1');
    expect(result).toBeNull();
  });
});