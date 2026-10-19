// @oktis-works/cms - Wizard: executor (espelho de automação + subprocesso)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { formatCommand, flagsToArgv, runCliCommand } from './wizard-run.js';
import { Prompt } from './prompt.js';
function fakeIO() {
    const input = new PassThrough();
    const chunks = [];
    const output = new Writable({
        write(chunk, _enc, cb) {
            chunks.push(String(chunk));
            cb();
        },
    });
    setImmediate(() => input.end('\n'));
    return { input, output, isTTY: true, out: () => chunks.join('') };
}
// ---------------------------------------------------------------------------
describe('formatCommand', () => {
    it('formats flags in the automation line', () => {
        expect(formatCommand('dev', [['yes', 'true']])).toBe('okcms dev --yes');
    });
    it('formats value flags with the value inline', () => {
        expect(formatCommand('deploy', [
            ['target', 'blue-green'],
            ['yes', 'true'],
        ])).toBe('okcms deploy --target blue-green --yes');
    });
    it('expands repeatable flags accumulated with \\n into separate occurrences', () => {
        expect(formatCommand('config', [['set', 'A=1\nB=2']])).toBe('okcms config --set A=1 --set B=2');
    });
    it('includes positional args right after the command', () => {
        expect(formatCommand('init', [['lang', 'pt']], ['meu-site'])).toBe('okcms init meu-site --lang pt');
    });
});
describe('flagsToArgv', () => {
    it('builds argv with --flag value pairs', () => {
        expect(flagsToArgv([['target', 'simple'], ['yes', 'true']])).toEqual([
            '--target',
            'simple',
            '--yes',
        ]);
    });
    it('repeats --set for every accumulated line', () => {
        expect(flagsToArgv([['set', 'A=1\nB=2']])).toEqual(['--set', 'A=1', '--set', 'B=2']);
    });
});
describe('runCliCommand', () => {
    it('prints the mirror line with the $ okcms prefix', async () => {
        const io = fakeIO();
        const prompt = new Prompt(io);
        const spawn = async () => ({ code: 0, interrupted: false });
        await runCliCommand('status', [], { prompt, spawn });
        expect(io.out()).toContain('$ okcms status');
        prompt.close();
    });
    it('reports success on exit 0', async () => {
        const io = fakeIO();
        const prompt = new Prompt(io);
        const spawn = async () => ({ code: 0, interrupted: false });
        const result = await runCliCommand('db:status', [], { prompt, spawn });
        expect(result.code).toBe(0);
        expect(io.out()).toContain('finished with success');
        prompt.close();
    });
    it('reports the exit code on failure', async () => {
        const io = fakeIO();
        const prompt = new Prompt(io);
        const spawn = async () => ({ code: 3, interrupted: false });
        const result = await runCliCommand('deploy', [['target', 'simple']], { prompt, spawn });
        expect(result.code).toBe(3);
        expect(io.out()).toContain('exited with code 3');
        prompt.close();
    });
    it('mentions Ctrl+C returns to the wizard for long-running commands', async () => {
        const io = fakeIO();
        const prompt = new Prompt(io);
        const spawn = async () => ({ code: 130, interrupted: true });
        const result = await runCliCommand('dev', [], { prompt, spawn, longRunning: true });
        expect(result.interrupted).toBe(true);
        expect(io.out()).toContain('Ctrl+C');
        expect(io.out()).toContain('interrupted');
        prompt.close();
    });
    it('passes the script + command + expanded flags to the spawn', async () => {
        const io = fakeIO();
        const prompt = new Prompt(io);
        const seen = { args: [] };
        const spawn = async (_exe, args) => {
            seen.args = args;
            return { code: 0, interrupted: false };
        };
        await runCliCommand('config', [['set', 'PORT=3001']], { prompt, spawn });
        expect(seen.args[1]).toBe('config');
        expect(seen.args).toContain('--set');
        expect(seen.args).toContain('PORT=3001');
        prompt.close();
    });
});
describe('resolveCliInvocation (no side effects)', () => {
    it('does not throw when argv[1] exists', async () => {
        // o teste roda via vitest — process.argv[1] é o runner; só garantimos que
        // a função devolve algo usável sem lançar
        const { resolveCliInvocation } = await import('./wizard-run.js');
        const inv = resolveCliInvocation();
        expect(inv.command.length).toBeGreaterThan(0);
        expect(inv.script.length).toBeGreaterThan(0);
    });
});
// garante que o spy não vaza entre testes
afterEach(() => {
    vi.restoreAllMocks();
});
//# sourceMappingURL=wizard-run.test.js.map