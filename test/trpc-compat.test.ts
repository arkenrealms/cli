import { initTRPC } from "@trpc/server";
import { expect, test, vi } from "vitest";
import { createCli, type TrpcCliMeta, z } from "../src";

test("can create cli from trpc v11", async () => {
  const t = initTRPC
    .context<{ customContext: true }>()
    .meta<TrpcCliMeta>()
    .create();

  const router = t.router({
    add: t.procedure
      .meta({ description: "Add two numbers" })
      .input(z.tuple([z.number(), z.number()]))
      .mutation(({ input }) => {
        return input[0] + input[1];
      }),
    foo: {
      bar: t.procedure.query(() => "baz"),
    },
    abc: t.router({
      def: t.procedure.query(() => "baz"),
    }),
  });

  expect(router._def.procedures).toHaveProperty("foo.bar");
  expect(router._def.procedures).not.toHaveProperty("foo");
  expect(router._def.procedures).toHaveProperty("abc.def");
  expect(router._def.procedures).not.toHaveProperty("abc");

  const cli = createCli({
    router,
    createCallerFactory: initTRPC.create().createCallerFactory,
  });

  expect(cli).toBeDefined();

  const log = vi.fn();
  const exit = vi.fn();
  await cli.run({
    argv: ["add", "1", "2"],
    logger: { info: log },
    process: { exit: exit as never },
  });
  expect(exit).toHaveBeenCalledWith(0);
  expect(log).toHaveBeenCalledWith(3);
});
