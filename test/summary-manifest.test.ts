import { expect, test } from '@jest/globals';
import { router } from '../router';
import { getSummaryCommandDescription } from '../summary-cli';
import { SUMMARY_COMMANDS } from '../summary-manifest.generated';

test('generated summary manifest matches the live router procedure inventory', () => {
  const procedures = (router as { _def?: { procedures?: Record<string, { _def?: { meta?: unknown } }> } })
    ._def?.procedures;

  expect(procedures).toBeDefined();

  const liveCommands = Object.entries(procedures ?? {}).map(([name, procedure]) => ({
    name,
    description: getSummaryCommandDescription(procedure._def?.meta),
  }));

  expect(SUMMARY_COMMANDS).toEqual(liveCommands);
});
