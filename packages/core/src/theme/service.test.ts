// @oktis-works/core - Theme Service Tests (ciclo de vida + descoberta)

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Descoberta de diretório: readdir/readFile dirigidos por variáveis de teste.
let readdirImpl: () => Promise<unknown[]>;
let readFileImpl: (path: string) => Promise<string>;

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(async () => readdirImpl()),
  readFile: vi.fn(async (path: string) => readFileImpl(path)),
}));

vi.mock('../extensions/project-directories.js', () => ({
  resolveExtensionDirectory: vi.fn(() => '/projeto/themes'),
}));

import { ThemeService } from './service.js';

const themeRow = (overrides: Row = {}): Row => ({
  id: 'id-1',
  name: 'meu-tema',
  version: '1.0.0',
  status: 'INSTALLED',
  manifest: { name: 'meu-tema', version: '1.0.0' },
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
      throw new Error('ENOENT'); // theme.json não existe (projeto antigo não migrado)
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
    expect(allQueries.some((q) => q.text.includes('INSERT') || q.text.includes('UPDATE'))).toBe(false);
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
    compatibility: { okcms: '^0.5.5' },
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
      [themeRow()],
      [themeRow({ config: { siteTitle: 'Meu site' } })],
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
