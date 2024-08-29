import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { configListHandler, configSetHandler } from "../services/configService";
import { createApplicationHandler } from "../services/applicationService";
const t = initTRPC.create();

export const appRouter = t.router({
  config: t.router({
    list: t.procedure.query(() => configListHandler()),
    set: t.procedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(({ input }) => configSetHandler(input)),
  }),
  application: t.router({
    create: t.procedure
      .input(z.string().describe("Application name"))
      .mutation(async ({ input }) => {
        await createApplicationHandler(input);
      }),
  }),
});

export type AppRouter = typeof appRouter;

export const createAppCaller = t.createCallerFactory(appRouter);
