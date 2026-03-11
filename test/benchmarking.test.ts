import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@jest/globals';
import {
  compareAgainstPreviousThree,
  formatDeltaPercent,
  parseJsonLinesHistory,
  selectBenchmarkScenarios,
  summarizePhase,
  type CliBenchmarkHistoryRecord,
} from '../benchmark-config';
import { createCliBenchmarkRecorder } from '../benchmark-runtime';

test('summarizePhase reports tolerance against configured targets', () => {
  const summary = summarizePhase([1000, 1200, 1400], 1100, 20);

  expect(summary.avgMs).toBeCloseTo(1200);
  expect(summary.targetMs).toBe(1100);
  expect(summary.allowedUpperMs).toBe(1320);
  expect(summary.withinTolerance).toBe(true);
});

test('compareAgainstPreviousThree uses the last three matching scenario averages', () => {
  const makeRecord = (scenario: string, avgMs: number): CliBenchmarkHistoryRecord => ({
    version: 1,
    suite: 'cli.startup',
    subject: '@arken/cli',
    capturedAt: new Date().toISOString(),
    scenario,
    description: scenario,
    command: ['--help'],
    envOverrides: {},
    warmupRuns: 1,
    measuredRuns: 3,
    nodeVersion: process.version,
    cwd: __dirname,
    summary: {
      boot: {
        avgMs,
        p50Ms: avgMs,
        p95Ms: avgMs,
        minMs: avgMs,
        maxMs: avgMs,
        targetMs: 1000,
        allowedUpperMs: 1200,
        withinTolerance: true,
      },
      initialized: {
        avgMs,
        p50Ms: avgMs,
        p95Ms: avgMs,
        minMs: avgMs,
        maxMs: avgMs,
        targetMs: 1000,
        allowedUpperMs: 1200,
        withinTolerance: true,
      },
      completed: {
        avgMs,
        p50Ms: avgMs,
        p95Ms: avgMs,
        minMs: avgMs,
        maxMs: avgMs,
        targetMs: 1000,
        allowedUpperMs: 1200,
        withinTolerance: true,
      },
      execution: {
        avgMs,
        p50Ms: avgMs,
        p95Ms: avgMs,
        minMs: avgMs,
        maxMs: avgMs,
        targetMs: 1000,
        allowedUpperMs: 1200,
        withinTolerance: true,
      },
    },
    comparisons: {
      boot: { previousThreeAvgMs: null, deltaMs: null, deltaPercent: null },
      initialized: { previousThreeAvgMs: null, deltaMs: null, deltaPercent: null },
      completed: { previousThreeAvgMs: null, deltaMs: null, deltaPercent: null },
      execution: { previousThreeAvgMs: null, deltaMs: null, deltaPercent: null },
    },
    samples: [],
  });

  const comparison = compareAgainstPreviousThree(
    [
      makeRecord('help', 1000),
      makeRecord('help', 1200),
      makeRecord('help', 1400),
      makeRecord('help', 1600),
    ],
    'help',
    'boot',
    1800
  );

  expect(comparison.previousThreeAvgMs).toBeCloseTo(1400);
  expect(comparison.deltaMs).toBeCloseTo(400);
  expect(comparison.deltaPercent).toBeCloseTo((400 / 1400) * 100);
  expect(formatDeltaPercent(comparison.deltaPercent)).toBe('+28.57%');
});

test('benchmark recorder writes a phase snapshot when enabled', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'arken-cli-benchmark-recorder-'));
  const outputPath = path.join(tempDir, 'run.json');
  let nowMs = 10_000;
  const recorder = createCliBenchmarkRecorder({
    argv: ['config.list'],
    env: {
      ARKEN_CLI_BENCHMARK_ENABLED: '1',
      ARKEN_CLI_BENCHMARK_SCENARIO: 'config.list',
      ARKEN_CLI_BENCHMARK_PROCESS_STARTED_AT_MS: '9000',
      ARKEN_CLI_BENCHMARK_OUTPUT_PATH: outputPath,
    },
    now: () => nowMs,
  });

  recorder.markInitialized({
    command: 'config.list',
    interactive: false,
    summaryOnly: false,
  });

  nowMs = 10_250;
  recorder.complete({ exitCode: 0 });

  const record = JSON.parse(readFileSync(outputPath, 'utf-8'));
  expect(record.scenario).toBe('config.list');
  expect(record.command).toBe('config.list');
  expect(record.phasesMs.boot).toBe(1000);
  expect(record.phasesMs.initialized).toBe(1000);
  expect(record.phasesMs.completed).toBe(1250);
  expect(record.phasesMs.execution).toBe(250);
  expect(record.outcome).toBe('completed');
});

test('parseJsonLinesHistory ignores blank lines between records', () => {
  const records = parseJsonLinesHistory('{"scenario":"help"}\n\n{"scenario":"config.list"}\n');
  expect(records).toHaveLength(2);
  expect((records[0] as { scenario: string }).scenario).toBe('help');
  expect((records[1] as { scenario: string }).scenario).toBe('config.list');
});

test('selectBenchmarkScenarios defaults to local-only scenarios', () => {
  const scenarios = selectBenchmarkScenarios({});
  expect(scenarios.map((scenario) => scenario.name)).toEqual([
    'help',
    'config.list',
    'invalid-command',
  ]);
});

test('selectBenchmarkScenarios includes live remote scenarios when requested', () => {
  const scenarios = selectBenchmarkScenarios({ includeLiveRemote: true });
  expect(scenarios.map((scenario) => scenario.name)).toEqual([
    'help',
    'config.list',
    'invalid-command',
    'cerebro.info',
    'hal.status',
    'hal.telemetry',
  ]);
});

test('selectBenchmarkScenarios honors explicit scenario names', () => {
  const scenarios = selectBenchmarkScenarios({
    requestedNames: ['hal.status', 'help'],
  });
  expect(scenarios.map((scenario) => scenario.name)).toEqual(['help', 'hal.status']);
});
