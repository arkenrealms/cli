import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CLI_BENCHMARK_HISTORY_PATH,
  CliBenchmarkHistoryRecord,
  CliBenchmarkPhaseName,
  compareAgainstPreviousThree,
  formatDeltaPercent,
  parseJsonLinesHistory,
  selectBenchmarkScenarios,
  serializeEnvOverrides,
  summarizePhase,
} from './benchmark-config';
import { runCliProcess } from './benchmark-harness';

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseNumberArg(name: string): number | undefined {
  const rawValue = parseArg(name);
  if (!rawValue) {
    return undefined;
  }
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseScenarioNames(): string[] {
  const rawValue = parseArg('--scenario');
  if (!rawValue) {
    return [];
  }

  const names = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return names;
}

function loadHistory(historyPath: string) {
  if (!existsSync(historyPath)) {
    return [] as CliBenchmarkHistoryRecord[];
  }

  return parseJsonLinesHistory(readFileSync(historyPath, 'utf-8'));
}

function formatPhaseLine(record: CliBenchmarkHistoryRecord, phaseName: CliBenchmarkPhaseName) {
  const summary = record.summary[phaseName];
  const comparison = record.comparisons[phaseName];
  const comparisonLabel =
    comparison.deltaPercent === null
      ? 'no history'
      : `${formatDeltaPercent(comparison.deltaPercent)} vs last3 avg`;
  const toleranceLabel = summary.withinTolerance ? 'within tolerance' : 'over target';

  return `${record.scenario}.${phaseName}: ${Math.round(summary.avgMs).toLocaleString()} ms (${comparisonLabel}) target<=${summary.targetMs.toLocaleString()} ms tol=${Math.round(
    summary.allowedUpperMs
  ).toLocaleString()} ms [${toleranceLabel}]`;
}

async function main() {
  const selectedScenarioNames = parseScenarioNames();
  const includeLiveRemote =
    hasFlag('--include-live-remote') || process.env.ARKEN_CLI_BENCH_INCLUDE_LIVE_REMOTE === '1';
  const historyPath = path.resolve(parseArg('--history-path') || CLI_BENCHMARK_HISTORY_PATH);
  const measuredRunsOverride = parseNumberArg('--runs');
  const warmupRunsOverride = parseNumberArg('--warmup');
  const appendHistory = parseArg('--append-history') !== 'false';
  const history = loadHistory(historyPath);

  const scenarios = selectBenchmarkScenarios({
    requestedNames: selectedScenarioNames,
    includeLiveRemote,
  });
  if (!scenarios.length) {
    const label = selectedScenarioNames.length ? selectedScenarioNames.join(', ') : '(default selection)';
    throw new Error(`No benchmark scenarios matched: ${label}`);
  }

  const newHistoryRecords: CliBenchmarkHistoryRecord[] = [];

  for (const scenario of scenarios) {
    const warmupRuns = warmupRunsOverride ?? scenario.warmupRuns;
    const measuredRuns = measuredRunsOverride ?? scenario.measuredRuns;

    for (let warmupRun = 0; warmupRun < warmupRuns; warmupRun += 1) {
      await runCliProcess(scenario.args, {
        envOverrides: scenario.envOverrides,
      });
    }

    const samples: CliBenchmarkHistoryRecord['samples'] = [];
    const bootValues: number[] = [];
    const initializedValues: number[] = [];
    const completedValues: number[] = [];
    const executionValues: number[] = [];

    for (let run = 0; run < measuredRuns; run += 1) {
      const result = await runCliProcess(scenario.args, {
        envOverrides: scenario.envOverrides,
        benchmarkScenario: scenario.name,
      });
      const benchmarkRecord = result.benchmarkRecord;

      if (!benchmarkRecord) {
        throw new Error(`Scenario ${scenario.name} did not emit a benchmark record`);
      }
      if (result.exitCode !== scenario.expectedExitCode) {
        throw new Error(
          `Scenario ${scenario.name} exited with ${result.exitCode}; expected ${scenario.expectedExitCode}`
        );
      }

      for (const fragment of scenario.expectedStdoutIncludes ?? []) {
        if (!result.stdout.includes(fragment)) {
          throw new Error(`Scenario ${scenario.name} stdout did not include ${JSON.stringify(fragment)}`);
        }
      }

      for (const fragment of scenario.expectedStderrIncludes ?? []) {
        if (!result.stderr.includes(fragment)) {
          throw new Error(`Scenario ${scenario.name} stderr did not include ${JSON.stringify(fragment)}`);
        }
      }

      bootValues.push(benchmarkRecord.phasesMs.boot);
      initializedValues.push(benchmarkRecord.phasesMs.initialized ?? benchmarkRecord.phasesMs.completed);
      completedValues.push(benchmarkRecord.phasesMs.completed);
      executionValues.push(benchmarkRecord.phasesMs.execution ?? 0);

      samples.push({
        run: run + 1,
        exitCode: benchmarkRecord.exitCode,
        bootMs: benchmarkRecord.phasesMs.boot,
        initializedMs: benchmarkRecord.phasesMs.initialized ?? benchmarkRecord.phasesMs.completed,
        completedMs: benchmarkRecord.phasesMs.completed,
        executionMs: benchmarkRecord.phasesMs.execution,
      });
    }

    const record: CliBenchmarkHistoryRecord = {
      version: 1,
      suite: 'cli.startup',
      subject: '@arken/cli',
      kind: scenario.kind,
      capturedAt: new Date().toISOString(),
      scenario: scenario.name,
      description: scenario.description,
      command: [...scenario.args],
      envOverrides: serializeEnvOverrides(scenario.envOverrides),
      warmupRuns,
      measuredRuns,
      nodeVersion: process.version,
      cwd: __dirname,
      summary: {
        boot: summarizePhase(bootValues, scenario.targetsMs.boot, scenario.tolerancePercent),
        initialized: summarizePhase(
          initializedValues,
          scenario.targetsMs.initialized,
          scenario.tolerancePercent
        ),
        completed: summarizePhase(completedValues, scenario.targetsMs.completed, scenario.tolerancePercent),
        execution: summarizePhase(executionValues, scenario.targetsMs.execution, scenario.tolerancePercent),
      },
      comparisons: {
        boot: compareAgainstPreviousThree(history, scenario.name, 'boot', average(bootValues)),
        initialized: compareAgainstPreviousThree(
          history,
          scenario.name,
          'initialized',
          average(initializedValues)
        ),
        completed: compareAgainstPreviousThree(history, scenario.name, 'completed', average(completedValues)),
        execution: compareAgainstPreviousThree(history, scenario.name, 'execution', average(executionValues)),
      },
      samples,
    };

    newHistoryRecords.push(record);

    // eslint-disable-next-line no-console
    console.log(`\n${scenario.name} [${scenario.kind}]: ${scenario.description}`);
    for (const phaseName of ['boot', 'initialized', 'completed', 'execution'] as CliBenchmarkPhaseName[]) {
      // eslint-disable-next-line no-console
      console.log(formatPhaseLine(record, phaseName));
    }
  }

  if (appendHistory) {
    for (const record of newHistoryRecords) {
      appendFileSync(historyPath, `${JSON.stringify(record)}\n`, 'utf-8');
    }
    // eslint-disable-next-line no-console
    console.log(`\nAppended benchmark history: ${historyPath}`);
  }
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

void main();
