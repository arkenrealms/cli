import path from 'node:path';

export type CliBenchmarkPhaseName = 'boot' | 'initialized' | 'completed' | 'execution';
export type CliBenchmarkScenarioKind = 'local' | 'live-remote';

export type CliBenchmarkTargets = Record<CliBenchmarkPhaseName, number>;

export type CliBenchmarkScenario = {
  kind: CliBenchmarkScenarioKind;
  name: string;
  description: string;
  args: string[];
  envOverrides: NodeJS.ProcessEnv;
  expectedExitCode: number;
  expectedStdoutIncludes?: string[];
  expectedStderrIncludes?: string[];
  targetsMs: CliBenchmarkTargets;
  tolerancePercent: number;
  warmupRuns: number;
  measuredRuns: number;
};

export type CliBenchmarkPhaseSummary = {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  targetMs: number;
  allowedUpperMs: number;
  withinTolerance: boolean;
};

export type CliBenchmarkPhaseComparison = {
  previousThreeAvgMs: number | null;
  deltaMs: number | null;
  deltaPercent: number | null;
};

export type CliBenchmarkRunRecord = {
  version: 1;
  kind: 'cli-benchmark-run';
  scenario: string;
  argv: string[];
  pid: number;
  nodeVersion: string;
  recordedAt: string;
  command: string | null;
  interactive: boolean;
  summaryOnly: boolean;
  outcome: 'completed' | 'failed';
  exitCode: number;
  failureMessage?: string;
  phasesMs: {
    boot: number;
    initialized: number | null;
    completed: number;
    execution: number | null;
  };
};

export type CliBenchmarkHistoryRecord = {
  version: 1;
  suite: 'cli.startup';
  subject: '@arken/cli';
  kind?: CliBenchmarkScenarioKind;
  capturedAt: string;
  scenario: string;
  description: string;
  command: string[];
  envOverrides: Record<string, string>;
  warmupRuns: number;
  measuredRuns: number;
  nodeVersion: string;
  cwd: string;
  summary: Record<CliBenchmarkPhaseName, CliBenchmarkPhaseSummary>;
  comparisons: Record<CliBenchmarkPhaseName, CliBenchmarkPhaseComparison>;
  samples: Array<{
    run: number;
    exitCode: number;
    bootMs: number;
    initializedMs: number;
    completedMs: number;
    executionMs: number | null;
  }>;
};

export const CLI_BENCHMARK_HISTORY_PATH = path.join(__dirname, 'benchmarks.jsonl');

export const DEFAULT_UNREACHABLE_REMOTE_ENV: NodeJS.ProcessEnv = {
  CEREBRO_SERVICE_URI: 'ws://127.0.0.1:1',
};

export const CLI_BENCHMARK_SCENARIOS: CliBenchmarkScenario[] = [
  {
    kind: 'local',
    name: 'help',
    description: 'Top-level help without initializing remote transport',
    args: ['--help'],
    envOverrides: DEFAULT_UNREACHABLE_REMOTE_ENV,
    expectedExitCode: 0,
    expectedStdoutIncludes: ['COMMANDS:', 'config.list', 'cerebro.info'],
    targetsMs: {
      boot: 2_000,
      initialized: 2_400,
      completed: 2_400,
      execution: 400,
    },
    tolerancePercent: 35,
    warmupRuns: 1,
    measuredRuns: 5,
  },
  {
    kind: 'local',
    name: 'config.list',
    description: 'Local config command without remote connectivity',
    args: ['config.list'],
    envOverrides: DEFAULT_UNREACHABLE_REMOTE_ENV,
    expectedExitCode: 0,
    expectedStdoutIncludes: ['Current Configuration', '"metaverse": "Arken"', '"application": "Cerebro"'],
    targetsMs: {
      boot: 2_000,
      initialized: 2_700,
      completed: 2_900,
      execution: 1_200,
    },
    tolerancePercent: 35,
    warmupRuns: 1,
    measuredRuns: 5,
  },
  {
    kind: 'local',
    name: 'invalid-command',
    description: 'Summary-only invalid command path without remote side effects',
    args: ['does.not.exist'],
    envOverrides: DEFAULT_UNREACHABLE_REMOTE_ENV,
    expectedExitCode: 1,
    expectedStdoutIncludes: ['COMMANDS:', 'config.list'],
    expectedStderrIncludes: ['Command not found: "does.not.exist".'],
    targetsMs: {
      boot: 2_000,
      initialized: 2_400,
      completed: 2_600,
      execution: 500,
    },
    tolerancePercent: 35,
    warmupRuns: 1,
    measuredRuns: 5,
  },
  {
    kind: 'live-remote',
    name: 'cerebro.info',
    description: 'Live Cerebro info query over the local service transport',
    args: ['cerebro.info'],
    envOverrides: {},
    expectedExitCode: 0,
    expectedStdoutIncludes: ['"name": "Cerebro"'],
    targetsMs: {
      boot: 2_000,
      initialized: 3_000,
      completed: 3_200,
      execution: 1_500,
    },
    tolerancePercent: 50,
    warmupRuns: 1,
    measuredRuns: 3,
  },
  {
    kind: 'live-remote',
    name: 'hal.status',
    description: 'Live HAL status snapshot over cerebro.exec',
    args: ['cerebro.exec', '--agent', 'HAL2000', '--method', 'hal2000.status.snapshot'],
    envOverrides: {},
    expectedExitCode: 0,
    expectedStdoutIncludes: ['"available": true', '"status":', '"captureHealth": {'],
    targetsMs: {
      boot: 2_000,
      initialized: 3_200,
      completed: 3_500,
      execution: 1_800,
    },
    tolerancePercent: 55,
    warmupRuns: 1,
    measuredRuns: 3,
  },
  {
    kind: 'live-remote',
    name: 'hal.telemetry',
    description: 'Live HAL Discord command telemetry over cerebro.exec',
    args: ['cerebro.exec', '--agent', 'HAL2000', '--method', 'hal2000.discordCommand.telemetry'],
    envOverrides: {},
    expectedExitCode: 0,
    expectedStdoutIncludes: ['"totalCount":', '"successCount":', '"commands": ['],
    targetsMs: {
      boot: 2_000,
      initialized: 3_200,
      completed: 3_500,
      execution: 1_800,
    },
    tolerancePercent: 55,
    warmupRuns: 1,
    measuredRuns: 3,
  },
];

export function selectBenchmarkScenarios(params: {
  requestedNames?: string[] | null;
  includeLiveRemote?: boolean;
}): CliBenchmarkScenario[] {
  const requestedNames = params.requestedNames?.filter(Boolean) ?? [];
  if (requestedNames.length) {
    const requestedNameSet = new Set(requestedNames);
    return CLI_BENCHMARK_SCENARIOS.filter((scenario) => requestedNameSet.has(scenario.name));
  }

  if (params.includeLiveRemote) {
    return [...CLI_BENCHMARK_SCENARIOS];
  }

  return CLI_BENCHMARK_SCENARIOS.filter((scenario) => scenario.kind === 'local');
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (!sortedValues.length) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1)
  );
  return sortedValues[index] ?? 0;
}

export function summarizePhase(values: number[], targetMs: number, tolerancePercent: number) {
  const sortedValues = [...values].sort((left, right) => left - right);
  const totalMs = sortedValues.reduce((sum, value) => sum + value, 0);
  const avgMs = sortedValues.length ? totalMs / sortedValues.length : 0;
  const allowedUpperMs = targetMs * (1 + tolerancePercent / 100);

  return {
    avgMs,
    p50Ms: percentile(sortedValues, 50),
    p95Ms: percentile(sortedValues, 95),
    minMs: sortedValues[0] ?? 0,
    maxMs: sortedValues[sortedValues.length - 1] ?? 0,
    targetMs,
    allowedUpperMs,
    withinTolerance: avgMs <= allowedUpperMs,
  };
}

export function parseJsonLinesHistory(historyText: string): CliBenchmarkHistoryRecord[] {
  return historyText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CliBenchmarkHistoryRecord);
}

export function compareAgainstPreviousThree(
  history: CliBenchmarkHistoryRecord[],
  scenarioName: string,
  phaseName: CliBenchmarkPhaseName,
  currentAvgMs: number
): CliBenchmarkPhaseComparison {
  const previous = history
    .filter((record) => record.suite === 'cli.startup' && record.scenario === scenarioName)
    .slice(-3);

  if (!previous.length) {
    return {
      previousThreeAvgMs: null,
      deltaMs: null,
      deltaPercent: null,
    };
  }

  const previousThreeAvgMs =
    previous.reduce((sum, record) => sum + record.summary[phaseName].avgMs, 0) / previous.length;
  const deltaMs = currentAvgMs - previousThreeAvgMs;
  const deltaPercent = previousThreeAvgMs === 0 ? 0 : (deltaMs / previousThreeAvgMs) * 100;

  return {
    previousThreeAvgMs,
    deltaMs,
    deltaPercent,
  };
}

export function formatDeltaPercent(deltaPercent: number | null): string {
  if (deltaPercent === null) {
    return 'n/a';
  }

  const sign = deltaPercent > 0 ? '+' : '';
  return `${sign}${deltaPercent.toFixed(2)}%`;
}

export function serializeEnvOverrides(envOverrides: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(envOverrides)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)])
  );
}
