import { type TrpcCliMeta, trpcServer, z } from '../../';
import Service from './help.service';

const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create();

export function createRouter(service: Service) {
  return trpc.router({
    man: trpc.procedure
      .meta({
        description: 'Gets the manual for a subject.',
      })
      .input(z.tuple([z.string()]))
      .query(({ input }) => service.man(input)),
  });
}
