import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { CliBenchmarkRunRecord } from './benchmark-config';

export type CliRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  combined: string;
  durationMs: number;
  benchmarkRecord?: CliBenchmarkRunRecord;
};

const maxBuffer = 16 * 1024 * 1024;
const cwd = path.resolve(__dirname);
const cliEntry = path.join(cwd, 'bin', 'arken');

export async function runCliProcess(
  args: string[],
  options: {
    envOverrides?: NodeJS.ProcessEnv;
    benchmarkScenario?: string;
  } = {}
): Promise<CliRunResult> {
  const tempDir =
    options.benchmarkScenario !== undefined
      ? mkdtempSync(path.join(os.tmpdir(), 'arken-cli-bench-'))
      : null;
  const benchmarkOutputPath = tempDir ? path.join(tempDir, 'result.json') : null;

  return new Promise((resolve, reject) => {
    const startedAt = performance.now();

    execFile(
      process.execPath,
      [cliEntry, ...args],
      {
        cwd,
        env: {
          ...process.env,
          ...options.envOverrides,
          ...(options.benchmarkScenario && benchmarkOutputPath
            ? {
                ARKEN_CLI_BENCHMARK_ENABLED: '1',
                ARKEN_CLI_BENCHMARK_SCENARIO: options.benchmarkScenario,
                ARKEN_CLI_BENCHMARK_PROCESS_STARTED_AT_MS: String(Date.now()),
                ARKEN_CLI_BENCHMARK_OUTPUT_PATH: benchmarkOutputPath,
              }
            : {}),
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

        let benchmarkRecord: CliBenchmarkRunRecord | undefined;
        if (benchmarkOutputPath) {
          benchmarkRecord = JSON.parse(readFileSync(benchmarkOutputPath, 'utf-8')) as CliBenchmarkRunRecord;
          rmSync(tempDir!, { recursive: true, force: true });
        }

        resolve({
          exitCode,
          stdout,
          stderr,
          combined: `${stdout}${stderr}`,
          durationMs,
          benchmarkRecord,
        });
      }
    );
  });
}
