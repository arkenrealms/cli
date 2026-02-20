import { afterEach, expect, test, vi } from 'vitest';
import { createTRPCProxyClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

afterEach(async () => {
  delete process.env.CEREBRO_SERVICE_URI;
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
