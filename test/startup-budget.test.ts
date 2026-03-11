import { expect, test } from '@jest/globals';
import { CLI_BENCHMARK_SCENARIOS } from '../benchmark-config';
import { runCliProcess } from '../benchmark-harness';

const coldHelpBudgetMs = 20_000;
const warmHelpBudgetMs = 20_000;
const localCommandBudgetMs = 20_000;
const helpScenario = CLI_BENCHMARK_SCENARIOS.find((scenario) => scenario.name === 'help')!;
const configListScenario = CLI_BENCHMARK_SCENARIOS.find((scenario) => scenario.name === 'config.list')!;
const invalidScenario = CLI_BENCHMARK_SCENARIOS.find((scenario) => scenario.name === 'invalid-command')!;

test(
  'bin help stays within the startup budget without remote connectivity',
  async () => {
  const runs = [];
  for (let index = 0; index < 3; index += 1) {
    runs.push(await runCliProcess(helpScenario.args, { envOverrides: helpScenario.envOverrides }));
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
  },
  90_000
);

test(
  'local commands still resolve without initializing the remote transport path',
  async () => {
  const result = await runCliProcess(configListScenario.args, {
    envOverrides: configListScenario.envOverrides,
  });

  expect(result.exitCode).toBe(0);
  expect(result.durationMs).toBeLessThanOrEqual(localCommandBudgetMs);
  expect(result.stdout).toContain('Current Configuration');
  expect(result.stdout).toContain('"metaverse": "Arken"');
  expect(result.stdout).toContain('"application": "Cerebro"');
  expect(result.combined).not.toContain('Request timeout');
  expect(result.combined).not.toContain('ECONNREFUSED');
  },
  60_000
);

test(
  'summary-only command errors stay concise without remote transport side effects',
  async () => {
  const result = await runCliProcess(invalidScenario.args, {
    envOverrides: invalidScenario.envOverrides,
  });

  expect(result.exitCode).toBe(1);
  expect(result.durationMs).toBeLessThanOrEqual(localCommandBudgetMs);
  expect(result.stderr).toContain('Command not found: "does.not.exist".');
  expect(result.stdout).toContain('COMMANDS:');
  expect(result.stdout).toContain('config.list');
  expect(result.combined).not.toContain('Request timeout');
  expect(result.combined).not.toContain('ECONNREFUSED');
  },
  60_000
);
