import { type TrpcCliMeta, trpcServer, z } from '../../';
import Service from './test.service';

const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create();

export function createRouter(service: Service) {
  return trpc.router({
    evolution: trpc.procedure
      .meta({
        description: 'Test evo',
      })
      .query(({ input, ctx }) => service.evolution(input, ctx)),
  });
}
