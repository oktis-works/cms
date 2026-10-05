// @oktis-works/plugin-runtime - Hook Registry Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRegistry } from './hook-registry.js';
function makeRegistry() {
    const registry = new HookRegistry();
    registry.setDevMode(false);
    return registry;
}
describe('HookRegistry actions', () => {
    let registry;
    beforeEach(() => {
        registry = makeRegistry();
    });
    it('executa callbacks na ordem de prioridade (menor primeiro)', async () => {
        const order = [];
        registry.addAction('okcms.test', () => order.push('padrao'), { priority: 10 });
        registry.addAction('okcms.test', () => order.push('cedo'), { priority: 5 });
        registry.addAction('okcms.test', () => order.push('tarde'), { priority: 20 });
        await registry.doAction('okcms.test');
        expect(order).toEqual(['cedo', 'padrao', 'tarde']);
    });
    it('respeita acceptedArgs explícito e o padrão callback.length', async () => {
        const received = [];
        registry.addAction('okcms.args', (...args) => received.push(args), {
            acceptedArgs: 3,
            priority: 5,
        });
        registry.addAction('okcms.args', (first) => received.push([first]), {
            priority: 10,
        });
        await registry.doAction('okcms.args', 'a', 'b', 'c');
        expect(received[0]).toEqual(['a', 'b', 'c']);
        expect(received[1]).toEqual(['a']);
    });
    it('erro em um callback não interrompe os demais (BUSI-031)', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const executed = [];
        registry.addAction('okcms.fail', () => {
            throw new Error('boom');
        });
        registry.addAction('okcms.fail', () => executed.push(true));
        await expect(registry.doAction('okcms.fail')).resolves.toBeUndefined();
        expect(executed).toEqual([true]);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
    it('didAction conta cada execução', async () => {
        expect(registry.didAction('okcms.count')).toBe(0);
        await registry.doAction('okcms.count');
        await registry.doAction('okcms.count');
        expect(registry.didAction('okcms.count')).toBe(2);
    });
    it('currentHook durante execução com reentrância (aninhamento)', async () => {
        const seen = [];
        registry.addAction('okcms.inner', () => {
            seen.push(registry.getCurrentHook());
        }, { priority: 1 });
        registry.addAction('okcms.outer', async () => {
            seen.push(registry.getCurrentHook());
            await registry.doAction('okcms.inner');
            seen.push(registry.getCurrentHook());
        });
        await registry.doAction('okcms.outer');
        // durante outer → 'outer'; durante inner → 'inner'; após aninhamento restaura 'outer'
        expect(seen).toEqual(['okcms.outer', 'okcms.inner', 'okcms.outer']);
        expect(registry.getCurrentHook()).toBeNull();
    });
});
describe('HookRegistry filters', () => {
    let registry;
    beforeEach(() => {
        registry = makeRegistry();
    });
    it('encadeia o valor entre callbacks em ordem de prioridade', () => {
        registry.addFilter('okcms.value', (value) => `${value}-b`, { priority: 20 });
        registry.addFilter('okcms.value', (value) => `${value}-a`, { priority: 5 });
        const result = registry.applyFilters('okcms.value', 'x');
        expect(result).toBe('x-a-b');
    });
    it('applyFiltersAsync resolve callbacks assíncronos em sequência', async () => {
        registry.addFilter('okcms.async', async (value) => `${String(value)}!`, { priority: 10 });
        registry.addFilter('okcms.async', (value) => `${String(value)}?`, { priority: 5 });
        const result = await registry.applyFiltersAsync('okcms.async', 'go');
        expect(result).toBe('go?!');
    });
    it('filtros recebem argumentos extras após o valor', () => {
        const seen = [];
        registry.addFilter('okcms.extra', (value, suffix) => {
            seen.push(suffix);
            return value;
        }, { acceptedArgs: 2 });
        registry.applyFilters('okcms.extra', 'v', 'sufixo');
        expect(seen).toEqual(['sufixo']);
    });
    it('currentHook é definido durante filtros', () => {
        registry.addFilter('okcms.during', () => registry.getCurrentHook());
        expect(registry.applyFilters('okcms.during', null)).toBe('okcms.during');
        expect(registry.getCurrentHook()).toBeNull();
    });
});
describe('Remoção e consulta', () => {
    it('removeAction/removeFilter removem apenas o callback alvo', () => {
        const registry = makeRegistry();
        const cb = () => undefined;
        const other = () => undefined;
        registry.addAction('okcms.rm', cb);
        registry.addAction('okcms.rm', other);
        expect(registry.hasAction('okcms.rm')).toBe(true);
        expect(registry.removeAction('okcms.rm', cb)).toBe(true);
        expect(registry.hasAction('okcms.rm', cb)).toBe(false);
        expect(registry.hasAction('okcms.rm', other)).toBe(true);
        const filterCb = (value) => value;
        registry.addFilter('okcms.rf', filterCb);
        expect(registry.removeFilter('okcms.rf', filterCb)).toBe(true);
        expect(registry.hasFilter('okcms.rf')).toBe(false);
    });
    it('removeAction retorna false quando não há correspondência', () => {
        const registry = makeRegistry();
        expect(registry.removeAction('okcms.nada', () => undefined)).toBe(false);
        expect(registry.hasAction('okcms.nada')).toBe(false);
    });
});
describe('BUSI-033 - Namespaced Hook Naming', () => {
    it('em modo dev rejeita hooks sem prefixo', () => {
        const registry = new HookRegistry();
        registry.setDevMode(true);
        expect(() => registry.addAction('sem_prefixo', () => undefined)).toThrow(/prefixado/i);
        expect(() => registry.addFilter('tambem_sem', (v) => v)).toThrow(/prefixado/i);
        expect(() => registry.addAction('okcms.ok', () => undefined)).not.toThrow();
        expect(() => registry.addAction('plugin.meu.hook', () => undefined)).not.toThrow();
    });
    it('fora do modo dev aceita qualquer nome', () => {
        const registry = makeRegistry();
        expect(() => registry.addAction('legado_sem_prefixo', () => undefined)).not.toThrow();
    });
});
describe('BUSI-032 - Hook Trust Level Gating', () => {
    it('silencia registro abaixo do nível exigido e registra auditoria', async () => {
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
        const entry = registry.getAuditLog()[0];
        expect(entry.type).toBe('HOOK_BLOCKED');
        expect(entry.sourceId).toBe('plugin-fraco');
        expect(entry.action).toBe('okcms.sensivel');
        expect(entry.reason).toContain('trust level 1');
    });
    it('permite registro no nível igual ou superior', async () => {
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
    it('fonte desconhecida tem nível zero', () => {
        const registry = makeRegistry();
        registry.addAction('okcms.qualquer', () => undefined, {
            sourceId: 'desconhecido',
            requiredTrustLevel: 1,
        });
        expect(registry.hasAction('okcms.qualquer')).toBe(false);
    });
});
//# sourceMappingURL=hook-registry.test.js.map