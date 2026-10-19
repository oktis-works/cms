// @oktis-works/cms - Wizard: fluxos guiados — 100% hermético
// (IO falso, estado injetado, spawn falso: nenhum processo nem docker real)
import { describe, it, expect } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { flowDeployBlueGreen, flowDeploySimple, flowDev, flowInit, flowUpdate, } from './wizard-flows.js';
import { catalogFor } from './wizard-i18n.js';
import { Prompt } from './prompt.js';
function fakeIO(lines) {
    const input = new PassThrough();
    const chunks = [];
    const output = new Writable({
        write(chunk, _enc, cb) {
            chunks.push(String(chunk));
            cb();
        },
    });
    setImmediate(() => input.end(`${lines.join('\n')}\n`));
    return { input, output, isTTY: true, out: () => chunks.join('') };
}
function stateOf(overrides = {}) {
    return {
        isProject: true,
        envComplete: true,
        envMissing: 0,
        dockerUp: true,
        infraRunning: true,
        appsRunning: false,
        appsLabels: [],
        ...overrides,
    };
}
function setup(lines, opts = {}) {
    const io = fakeIO(lines);
    const prompt = new Prompt(io);
    const calls = [];
    const spawn = async (_exe, args) => {
        calls.push(args);
        return { code: opts.code ?? 0, interrupted: false };
    };
    const state = stateOf(opts.state);
    const deps = {
        prompt,
        catalog: catalogFor('en'),
        cwd: '/tmp/okcms-flow-test',
        spawn,
        stateFn: () => state,
    };
    return { deps, io, prompt, calls };
}
// ---------------------------------------------------------------------------
describe('flowDev', () => {
    it('skips the env interview, confirms and runs `okcms dev` as a subprocess', async () => {
        const { deps, io, prompt, calls } = setup(['2', 'y']); // pular env → confirmar
        const outcome = await flowDev(deps);
        prompt.close();
        expect(outcome).toBe('done');
        expect(io.out()).toContain('$ okcms dev');
        expect(io.out()).toContain('Ctrl+C'); // long-running: aviso de retorno ao wizard
        expect(calls).toHaveLength(1);
        expect(calls[0][1]).toBe('dev');
    });
    it('returns to the failure menu when the command exits non-zero', async () => {
        const { deps, io, prompt, calls } = setup(['2', 'y', '3'], { code: 1 });
        const outcome = await flowDev(deps);
        prompt.close();
        expect(outcome).toBe('failed');
        expect(io.out()).toContain('exited with code 1');
        expect(io.out()).toContain('what now?');
        expect(calls).toHaveLength(1);
    });
    it('retries from the failure menu when the user picks retry', async () => {
        // falha (code 1) → menu → retry(2) → spawna de novo (mesmo code) → menu → menu(3)
        const io = fakeIO(['2', 'y', '2', '3']);
        const prompt = new Prompt(io);
        let attempt = 0;
        const calls = [];
        const spawn = async (_exe, args) => {
            calls.push(args);
            attempt += 1;
            return { code: attempt === 1 ? 1 : 0, interrupted: false };
        };
        const deps = {
            prompt,
            catalog: catalogFor('en'),
            cwd: '/tmp/okcms-flow-test',
            spawn,
            stateFn: () => stateOf(),
        };
        const outcome = await flowDev(deps);
        prompt.close();
        expect(outcome).toBe('done'); // retry com exit 0 → fluxo concluído
        expect(calls).toHaveLength(2);
    });
});
describe('flowDeployBlueGreen', () => {
    it('offers to stop local apps first, then deploys with --target blue-green --yes', async () => {
        const { deps, io, prompt, calls } = setup(['2', 'y', 'y'], {
            state: { appsRunning: true, appsLabels: ['api'] },
        });
        const outcome = await flowDeployBlueGreen(deps);
        prompt.close();
        expect(outcome).toBe('done');
        expect(io.out()).toContain('they hold the ports');
        expect(io.out()).toContain('$ okcms deploy --target blue-green --yes');
        expect(calls).toHaveLength(2);
        expect(calls[0][1]).toBe('stop'); // pré-checagem parou os apps
        expect(calls[1]).toEqual([calls[1][0], 'deploy', '--target', 'blue-green', '--yes']);
    });
    it('refuses to deploy when the user declines stopping the apps', async () => {
        const { deps, io, prompt, calls } = setup(['2', 'n'], {
            state: { appsRunning: true, appsLabels: ['api'] },
        });
        const outcome = await flowDeployBlueGreen(deps);
        prompt.close();
        expect(outcome).toBe('cancelled');
        expect(calls).toEqual([]); // nada foi executado
        expect(io.out()).toContain('cancelled — nothing was executed');
    });
});
describe('flowDeploySimple', () => {
    it('aborts when docker is unavailable', async () => {
        const { deps, io, prompt, calls } = setup(['2'], { state: { dockerUp: false } });
        const outcome = await flowDeploySimple(deps);
        prompt.close();
        expect(outcome).toBe('cancelled');
        expect(calls).toEqual([]);
        expect(io.out()).toContain('docker: not available');
    });
    it('aborts outside an OkCMS project', async () => {
        const { deps, io, prompt, calls } = setup(['2'], { state: { isProject: false } });
        const outcome = await flowDeploySimple(deps);
        prompt.close();
        expect(outcome).toBe('cancelled');
        expect(calls).toEqual([]);
        expect(io.out()).toContain('expects an OkCMS project');
    });
});
describe('flowUpdate', () => {
    it('runs `okcms update` after confirmation', async () => {
        const { deps, io, prompt, calls } = setup(['y']);
        const outcome = await flowUpdate(deps);
        prompt.close();
        expect(outcome).toBe('done');
        expect(io.out()).toContain('$ okcms update');
        expect(calls[0][1]).toBe('update');
    });
    it('aborts outside a project before prompting confirmation', async () => {
        const { deps, io, prompt, calls } = setup([], { state: { isProject: false } });
        const outcome = await flowUpdate(deps);
        prompt.close();
        expect(outcome).toBe('cancelled');
        expect(calls).toEqual([]);
        expect(io.out()).toContain('expects an OkCMS project');
    });
});
describe('flowInit', () => {
    it('collects directory + docs language + install choice, then runs init', async () => {
        const { deps, io, prompt, calls } = setup(['', '1', '1', 'y']); // dir default, en, install, sim
        const outcome = await flowInit(deps);
        prompt.close();
        expect(outcome).toBe('done');
        expect(io.out()).toContain('$ okcms init . --lang en');
        expect(calls).toHaveLength(1);
        expect(calls[0][1]).toBe('init');
        expect(calls[0]).toContain('--lang');
        expect(calls[0]).toContain('en');
    });
    it('adds --no-install when the user declines dependency install', async () => {
        const { deps, prompt, calls } = setup(['meu-site', '2', '2', 'y']); // dir, pt, sem install, sim
        const outcome = await flowInit(deps);
        prompt.close();
        expect(outcome).toBe('done');
        expect(calls[0]).toContain('--no-install');
        expect(calls[0]).toContain('pt');
    });
    it('cancels cleanly when confirmation is declined', async () => {
        const { deps, io, prompt, calls } = setup(['', '1', '1', 'n']);
        const outcome = await flowInit(deps);
        prompt.close();
        expect(outcome).toBe('cancelled');
        expect(calls).toEqual([]);
        expect(io.out()).toContain('cancelled — nothing was executed');
    });
});
//# sourceMappingURL=wizard-flows.test.js.map