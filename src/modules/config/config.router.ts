import { type TrpcCliMeta, trpcServer, z } from "../../";
import Service from "./config.service";

const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create();

export function createRouter(service: Service) {
  const listProcedure = trpc.procedure
    .meta({
      description: "List the current configuration",
    })
    .query(async ({ input }) => {
      await service.list({ input });
    });

  return trpc.router({
    set: trpc.procedure
      .meta({
        description:
          'Set a configuration value. Use either "key=value" or "key value" format',
      })
      .input(
        z.tuple([z.string().describe("Key"), z.string().describe("Value")])
      )
      .query(async ({ input }) => {
        await service.set({ input });
      }),

    list: listProcedure,
    ls: listProcedure,
  });
}
