import { type TrpcCliMeta, trpcServer, z } from '../../';
import Service from './math.service';

const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create();

export function createRouter(service: Service) {
  return trpc.router({
    add: trpc.procedure
      .meta({
        description:
          'Add two numbers. Use this if you and your friend both have apples, and you want to know how many apples there are in total.',
      })
      .input(z.tuple([z.number(), z.number()]))
      .query(({ input }) => service.add(input)),
    subtract: trpc.procedure
      .meta({
        description:
          'Subtract two numbers. Useful if you have a number and you want to make it smaller.',
      })
      .input(z.tuple([z.number(), z.number()]))
      .query(({ input }) => service.subtract(input)),
    multiply: trpc.procedure
      .meta({
        description:
          'Multiply two numbers together. Useful if you want to count the number of tiles on your bathroom wall and are short on time.',
      })
      .input(z.tuple([z.number(), z.number()]))
      .query(({ input }) => service.multiply(input)),
    divide: trpc.procedure
      .meta({
        version: '1.0.0',
        description:
          "Divide two numbers. Useful if you have a number and you want to make it smaller and `subtract` isn't quite powerful enough for you.",
        examples: 'divide --left 8 --right 4',
      })
      .input(
        z.tuple([
          z.number().describe('numerator'),
          z
            .number()
            .refine((n) => n !== 0)
            .describe('denominator'),
        ])
      )
      .mutation(({ input }) => service.divide(input)),
  });
}
