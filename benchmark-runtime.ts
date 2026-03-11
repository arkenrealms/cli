import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CliBenchmarkRunRecord } from './benchmark-config';

const ENABLED_ENV_KEY = 'ARKEN_CLI_BENCHMARK_ENABLED';
const OUTPUT_PATH_ENV_KEY = 'ARKEN_CLI_BENCHMARK_OUTPUT_PATH';
const PROCESS_STARTED_AT_ENV_KEY = 'ARKEN_CLI_BENCHMARK_PROCESS_STARTED_AT_MS';
const SCENARIO_ENV_KEY = 'ARKEN_CLI_BENCHMARK_SCENARIO';

export function createCliBenchmarkRecorder(
  recorderParams: {
    env?: NodeJS.ProcessEnv;
    argv: string[];
    now?: () => number;
  } = { argv: [] }
) {
  const env = recorderParams.env ?? process.env;
  const now = recorderParams.now ?? Date.now;
  const enabled = env[ENABLED_ENV_KEY] === '1';
  const outputPath = enabled ? env[OUTPUT_PATH_ENV_KEY] : undefined;
  const processStartedAtMs = Number(env[PROCESS_STARTED_AT_ENV_KEY]);

  if (!enabled || !outputPath || !Number.isFinite(processStartedAtMs)) {
    return {
      enabled: false,
      markInitialized: (_meta?: unknown) => {},
      complete: (_meta?: unknown) => {},
      fail: (_meta?: unknown) => {},
      wrapProcessExit: (exit: (code: number) => never) => exit,
    };
  }

  const bootAtMs = now();
  let initializedAtMs: number | null = null;
  let flushed = false;
  let metadata: {
    command: string | null;
    interactive: boolean;
    summaryOnly: boolean;
  } = {
    command: null,
    interactive: false,
    summaryOnly: false,
  };

  const writeRecord = (record: CliBenchmarkRunRecord) => {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
  };

  const flush = (params: {
    outcome: 'completed' | 'failed';
    exitCode: number;
    failureMessage?: string;
  }) => {
    if (flushed) {
      return;
    }
    flushed = true;

    const completedAtMs = now();
    const record: CliBenchmarkRunRecord = {
      version: 1,
      kind: 'cli-benchmark-run',
      scenario: String(env[SCENARIO_ENV_KEY] ?? 'unknown'),
      argv: [...paramsEnvArgv(recorderParams.argv)],
      pid: process.pid,
      nodeVersion: process.version,
      recordedAt: new Date().toISOString(),
      command: metadata.command,
      interactive: metadata.interactive,
      summaryOnly: metadata.summaryOnly,
      outcome: params.outcome,
      exitCode: params.exitCode,
      failureMessage: params.failureMessage,
      phasesMs: {
        boot: Math.max(bootAtMs - processStartedAtMs, 0),
        initialized:
          initializedAtMs === null ? null : Math.max(initializedAtMs - processStartedAtMs, 0),
        completed: Math.max(completedAtMs - processStartedAtMs, 0),
        execution:
          initializedAtMs === null ? null : Math.max(completedAtMs - initializedAtMs, 0),
      },
    };

    writeRecord(record);
  };

  return {
    enabled: true,
    markInitialized(meta?: {
      command?: string | null;
      interactive?: boolean;
      summaryOnly?: boolean;
    }) {
      if (meta) {
        metadata = {
          command: meta.command ?? metadata.command,
          interactive: meta.interactive ?? metadata.interactive,
          summaryOnly: meta.summaryOnly ?? metadata.summaryOnly,
        };
      }
      if (initializedAtMs === null) {
        initializedAtMs = now();
      }
    },
    complete(meta?: {
      exitCode?: number;
      command?: string | null;
      interactive?: boolean;
      summaryOnly?: boolean;
    }) {
      if (meta) {
        metadata = {
          command: meta.command ?? metadata.command,
          interactive: meta.interactive ?? metadata.interactive,
          summaryOnly: meta.summaryOnly ?? metadata.summaryOnly,
        };
      }
      flush({ outcome: 'completed', exitCode: meta?.exitCode ?? 0 });
    },
    fail(meta?: {
      exitCode?: number;
      failureMessage?: string;
      command?: string | null;
      interactive?: boolean;
      summaryOnly?: boolean;
    }) {
      if (meta) {
        metadata = {
          command: meta.command ?? metadata.command,
          interactive: meta.interactive ?? metadata.interactive,
          summaryOnly: meta.summaryOnly ?? metadata.summaryOnly,
        };
      }
      flush({
        outcome: 'failed',
        exitCode: meta?.exitCode ?? 1,
        failureMessage: meta?.failureMessage,
      });
    },
    wrapProcessExit(exit: (code: number) => never) {
      return (code: number): never => {
        flush({ outcome: code === 0 ? 'completed' : 'failed', exitCode: code });
        return exit(code);
      };
    },
  };
}

function paramsEnvArgv(argv: string[]): string[] {
  return argv.filter((value) => value !== undefined);
}
