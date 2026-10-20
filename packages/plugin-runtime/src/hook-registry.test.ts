// @oktis-works/plugin-runtime - Hook Registry Tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRegistry } from './hook-registry.js';

function makeRegistry(): HookRegistry {
  const registry = new HookRegistry();
  registry.setDevMode(false);
  return registry;
}

describe('HookRegistry actions', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = makeRegistry();
  });

  it('executa callbacks na ordem de prioridade (menor primeiro)', async () => {
    const order: string[] = [];

    registry.addAction('okcms.test', () => order.push('padrao'), { priority: 10 });
    registry.addAction('okcms.test', () => order.push('cedo'), { priority: 5 });
    registry.addAction('okcms.test', () => order.push('tarde'), { priority: 20 });

    await registry.doAction('okcms.test');

    expect(order).toEqual(['cedo', 'padrao', 'tarde']);
  });

  it('honors explicit acceptedArgs and the callback.length default', async () => {
    const received: unknown[][] = [];

    registry.addAction('okcms.args', (...args: unknown[]) => received.push(args), {
      acceptedArgs: 3,
      priority: 5,
    });
    registry.addAction('okcms.args', (first?: unknown) => received.push([first]), {
      priority: 10,
    });

    await registry.doAction('okcms.args', 'a', 'b', 'c');

    expect(received[0]).toEqual(['a', 'b', 'c']);
    expect(received[1]).toEqual(['a']);
  });

  it('an error in one callback does not interrupt the others (BUSI-031)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const executed: boolean[] = [];

    registry.addAction('okcms.fail', () => {
      throw new Error('boom');
    });
    registry.addAction('okcms.fail', () => executed.push(true));

    await expect(registry.doAction('okcms.fail')).resolves.toBeUndefined();
    expect(executed).toEqual([true]);
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('didAction counts each execution', async () => {
    expect(registry.didAction('okcms.count')).toBe(0);

    await registry.doAction('okcms.count');
    await registry.doAction('okcms.count');

    expect(registry.didAction('okcms.count')).toBe(2);
  });

  it('currentHook during execution with reentrancy (nesting)', async () => {
    const seen: Array<string | null> = [];

    registry.addAction('okcms.inner', () => {
      seen.push(registry.getCurrentHook());
    }, { priority: 1 });

    registry.addAction('okcms.outer', async () => {
      seen.push(registry.getCurrentHook());
      await registry.doAction('okcms.inner');
      seen.push(registry.getCurrentHook());
    });

    await registry.doAction('okcms.outer');

    // during outer → 'outer'; during inner → 'inner'; after nesting restores 'outer'
    expect(seen).toEqual(['okcms.outer', 'okcms.inner', 'okcms.outer']);
    expect(registry.getCurrentHook()).toBeNull();
  });
});

describe('HookRegistry filters', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = makeRegistry();
  });

  it('encadeia o valor entre callbacks em ordem de prioridade', () => {
    registry.addFilter('okcms.value', (value) => `${value}-b`, { priority: 20 });
    registry.addFilter('okcms.value', (value) => `${value}-a`, { priority: 5 });

    const result = registry.applyFilters('okcms.value', 'x');

    expect(result).toBe('x-a-b');
  });

  it('applyFiltersAsync resolves async callbacks in sequence', async () => {
    registry.addFilter(
      'okcms.async',
      async (value: unknown) => `${String(value)}!`,
      { priority: 10 }
    );
    registry.addFilter('okcms.async', (value) => `${String(value)}?`, { priority: 5 });

    const result = await registry.applyFiltersAsync('okcms.async', 'go');

    expect(result).toBe('go?!');
  });

  it('filters receive extra arguments after the value', () => {
    const seen: unknown[] = [];

    registry.addFilter('okcms.extra', (value, suffix) => {
      seen.push(suffix);
      return value;
    }, { acceptedArgs: 2 });

    registry.applyFilters('okcms.extra', 'v', 'sufixo');

    expect(seen).toEqual(['sufixo']);
  });

  it('currentHook is set during filters', () => {
    registry.addFilter('okcms.during', () => registry.getCurrentHook());

    expect(registry.applyFilters('okcms.during', null)).toBe('okcms.during');
    expect(registry.getCurrentHook()).toBeNull();
  });
});

describe('Removal and lookup', () => {
  it('removeAction/removeFilter removem apenas o callback alvo', () => {
    const registry = makeRegistry();
    const cb = (): void => undefined;
    const other = (): void => undefined;

    registry.addAction('okcms.rm', cb);
    registry.addAction('okcms.rm', other);

    expect(registry.hasAction('okcms.rm')).toBe(true);
    expect(registry.removeAction('okcms.rm', cb)).toBe(true);
    expect(registry.hasAction('okcms.rm', cb)).toBe(false);
    expect(registry.hasAction('okcms.rm', other)).toBe(true);

    const filterCb = (value: unknown): unknown => value;
    registry.addFilter('okcms.rf', filterCb);
    expect(registry.removeFilter('okcms.rf', filterCb)).toBe(true);
    expect(registry.hasFilter('okcms.rf')).toBe(false);
  });

  it('removeAction returns false when nothing matches', () => {
    const registry = makeRegistry();

    expect(registry.removeAction('okcms.nada', (): void => undefined)).toBe(false);
    expect(registry.hasAction('okcms.nada')).toBe(false);
  });
});

describe('BUSI-033 - Namespaced Hook Naming', () => {
  it('em modo dev rejeita hooks sem prefixo', () => {
    const registry = new HookRegistry();
    registry.setDevMode(true);

    expect(() => registry.addAction('sem_prefixo', (): void => undefined)).toThrow(/prefixed/i);
    expect(() => registry.addFilter('tambem_sem', (v) => v)).toThrow(/prefixed/i);

    expect(() => registry.addAction('okcms.ok', (): void => undefined)).not.toThrow();
    expect(() => registry.addAction('plugin.meu.hook', (): void => undefined)).not.toThrow();
  });

  it('fora do modo dev aceita qualquer nome', () => {
    const registry = makeRegistry();

    expect(() => registry.addAction('legado_sem_prefixo', (): void => undefined)).not.toThrow();
  });
});

describe('BUSI-032 - Hook Trust Level Gating', () => {
  it('silences registration below the required level and records the audit', async () => {
    const registry = makeRegistry();
    registry.setTrustLevel('plugin-fraco', 1);

    let called = false;
    registry.addAction('okcms.sensivel', () => {
      called = true;
    }, {
      sourceId: 'plugin-fraco',
      sourceType: 'plugin',
      requiredTrustLevel: 2,
    });

    await registry.doAction('okcms.sensivel');

    expect(called).toBe(false);
    expect(registry.getAuditLog()).toHaveLength(1);

    const entry = registry.getAuditLog()[0]!;
    expect(entry.type).toBe('HOOK_BLOCKED');
    expect(entry.sourceId).toBe('plugin-fraco');
    expect(entry.action).toBe('okcms.sensivel');
    expect(entry.reason).toContain('trust level 1');
  });

  it('allows registration at an equal or higher level', async () => {
    const registry = makeRegistry();
    registry.setTrustLevel('plugin-forte', 3);

    let called = false;
    registry.addAction('okcms.sensivel', () => {
      called = true;
    }, {
      sourceId: 'plugin-forte',
      sourceType: 'plugin',
      requiredTrustLevel: 3,
    });

    await registry.doAction('okcms.sensivel');

    expect(called).toBe(true);
    expect(registry.getAuditLog()).toHaveLength(0);
  });

  it('an unknown source has level zero', () => {
    const registry = makeRegistry();

    registry.addAction('okcms.qualquer', (): void => undefined, {
      sourceId: 'desconhecido',
      requiredTrustLevel: 1,
    });

    expect(registry.hasAction('okcms.qualquer')).toBe(false);
  });
});
