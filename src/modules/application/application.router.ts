import { type TrpcCliMeta, trpcServer, z } from "../../";
import Service from "./application.service";

const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create();

export function createRouter(service: Service) {
  return trpc.router({
    create: trpc.procedure
      .meta({
        description: "Create a new application",
      })
      .input(z.tuple([z.string().describe("Name")]))
      .query(async ({ input }) => {
        await service.create({ input });
      }),
  });
}
