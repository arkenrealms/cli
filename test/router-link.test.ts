import { afterEach, expect, test, vi } from 'vitest';
import { createTRPCProxyClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

afterEach(async () => {
  delete process.env.CEREBRO_SERVICE_URI;
  delete process.env.ARKEN_CLI_CEREBRO_REQUEST_TIMEOUT_MS;
  delete process.env.ARKEN_CLI_REMOTE_REQUEST_TIMEOUT_MS;
  vi.resetModules();
});

test('link executes local procedures without router namespace', async () => {
  const trpc = initTRPC.context<any>().create();
  const localRouter = trpc.router({
    add: trpc.procedure.input(z.tuple([z.number(), z.number()])).query(({ input }) => input[0] + input[1]),
  });

  const { link } = await import('../router');
  const client: any = createTRPCProxyClient({
    links: [link({ app: {}, router: localRouter })],
  });

  await expect(client.add.query([1, 2])).resolves.toEqual(3);
});


test('cerebro route uses an extended remote timeout by default', async () => {
  const { resolveRouteRequestTimeoutMs } = await import('../router');

  expect(resolveRouteRequestTimeoutMs('cerebro')).toBe(300_000);
  expect(resolveRouteRequestTimeoutMs('seer')).toBe(15_000);
});

test('route request timeout honors env overrides', async () => {
  process.env.ARKEN_CLI_CEREBRO_REQUEST_TIMEOUT_MS = '45000';
  process.env.ARKEN_CLI_REMOTE_REQUEST_TIMEOUT_MS = '25000';

  const { resolveRouteRequestTimeoutMs } = await import('../router');

  expect(resolveRouteRequestTimeoutMs('cerebro')).toBe(45_000);
  expect(resolveRouteRequestTimeoutMs('seer')).toBe(25_000);
});
