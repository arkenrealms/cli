import path from 'node:path';
import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { expect, test } from 'vitest';

const cwd = path.resolve(__dirname, '..');
const cliEntry = path.join(cwd, 'bin', 'arken');
const maxBuffer = 16 * 1024 * 1024;
const coldHelpBudgetMs = 10_000;
const warmHelpBudgetMs = 6_000;
const localCommandBudgetMs = 6_000;
const unreachableRemoteEnv = {
  CEREBRO_SERVICE_URI: 'ws://127.0.0.1:1',
};

type CliRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  combined: string;
  durationMs: number;
};

function runCli(args: string[], envOverrides: NodeJS.ProcessEnv = {}): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();

    execFile(
      process.execPath,
      [cliEntry, ...args],
      {
        cwd,
        env: {
          ...process.env,
          ...envOverrides,
        },
        maxBuffer,
      },
      (error, stdout, stderr) => {
        const durationMs = performance.now() - startedAt;
        const exitCode =
          typeof (error as { code?: unknown } | null)?.code === 'number'
            ? ((error as { code: number }).code ?? 1)
            : 0;

        if (error && typeof error !== 'object') {
          reject(error);
          return;
        }

        resolve({
          exitCode,
          stdout,
          stderr,
          combined: `${stdout}${stderr}`,
          durationMs,
        });
      }
    );
  });
}

test('bin help stays within the startup budget without remote connectivity', async () => {
  const runs: CliRunResult[] = [];
  for (let index = 0; index < 3; index += 1) {
    runs.push(await runCli(['--help'], unreachableRemoteEnv));
  }

  runs.forEach((run) => {
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('COMMANDS:');
    expect(run.stdout).toContain('config.list');
    expect(run.stdout).toContain('cerebro.info');
    expect(run.combined).not.toContain('Request timeout');
    expect(run.combined).not.toContain('ECONNREFUSED');
  });

  expect(runs[0].durationMs).toBeLessThanOrEqual(coldHelpBudgetMs);
  runs.slice(1).forEach((run) => {
    expect(run.durationMs).toBeLessThanOrEqual(warmHelpBudgetMs);
  });
});

test('local commands still resolve without initializing the remote transport path', async () => {
  const result = await runCli(['config.list'], unreachableRemoteEnv);

  expect(result.exitCode).toBe(0);
  expect(result.durationMs).toBeLessThanOrEqual(localCommandBudgetMs);
  expect(result.stdout).toContain('Current Configuration');
  expect(result.stdout).toContain('"metaverse": "Arken"');
  expect(result.stdout).toContain('"application": "Cerebro"');
  expect(result.combined).not.toContain('Request timeout');
  expect(result.combined).not.toContain('ECONNREFUSED');
});

test('summary-only command errors stay concise without remote transport side effects', async () => {
  const result = await runCli(['does.not.exist'], unreachableRemoteEnv);

  expect(result.exitCode).toBe(1);
  expect(result.durationMs).toBeLessThanOrEqual(localCommandBudgetMs);
  expect(result.stderr).toContain('Command not found: "does.not.exist".');
  expect(result.stdout).toContain('COMMANDS:');
  expect(result.stdout).toContain('config.list');
  expect(result.combined).not.toContain('Request timeout');
  expect(result.combined).not.toContain('ECONNREFUSED');
});
