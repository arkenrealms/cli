import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { afterEach, expect, test, vi } from 'vitest';
import { createCli } from '../index';

afterEach(() => {
  vi.restoreAllMocks();
});

test('verbose errors throw without debug console noise', async () => {
  const trpc = initTRPC.context<{}>().create();
  const router = trpc.router({
    add: trpc.procedure.input(z.tuple([z.number(), z.number()])).query(({ input }) => input[0] + input[1]),
  });

  const cli = createCli({ router });
  const exitSpy = vi.fn((code: number) => {
    throw new Error(`exit:${code}`);
  });
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  await expect(
    cli.run({
      argv: ['does.not.exist', '--verboseErrors'],
      process: {
        stdin: process.stdin,
        stdout: process.stdout,
        exit: exitSpy as never,
      },
    })
  ).rejects.toThrow('Command not found');

  expect(exitSpy).not.toHaveBeenCalled();
  expect(consoleSpy).not.toHaveBeenCalledWith('throwing error');
});
