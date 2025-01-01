import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';

import { createTRPCProxyClient, TRPCClientError } from '@trpc/client';
import { createTRPCReact, TRPCLink } from '@trpc/react-query';
import { createRouter as createRelayRouter, Router as RelayRouter } from '@arken/node/router';
import {
  createRouter as createEvolutionRouter,
  Router as EvolutionRouter,
} from '@arken/evolution-protocol/realm/realm.router';
// import {
//   createRouter as createIslesRouter,
//   Router as IslesRouter,
// } from '@arken/meme-isles-protocol/realm/realm.router';
// import {
//   createRouter as createOasisRouter,
//   Router as OasisRouter,
// } from '@arken/oasis-protocol/realm/realm.router';
import { createRouter as createSeerRouter, Router as SeerRouter } from '@arken/seer-protocol';
import {
  createRouter as createCerebroRouter,
  Router as CerebroRouter,
} from '@arken/cerebro-protocol';
import { io as ioClient } from 'socket.io-client';
import { serialize, deserialize } from '@arken/node/util/rpc';
import { generateShortId } from '@arken/node/util/db';

import ApplicationService from './modules/application/application.service';
import { createRouter as createApplicationRouter } from './modules/application/application.router';
import ConfigService from './modules/config/config.service';
import { createRouter as createConfigRouter } from './modules/config/config.router';
import MathService from './modules/math/math.service';
import { createRouter as createMathRouter } from './modules/math/math.router';
import HelpService from './modules/help/help.service';
import { createRouter as createHelpRouter } from './modules/help/help.router';
import TestService from './modules/test/test.service';
import { createRouter as createTestRouter } from './modules/test/test.router';

import dotEnv from 'dotenv';
dotEnv.config();

// Define the merged router type
type MergedRouter = {
  application: ReturnType<typeof createApplicationRouter>;
  config: ReturnType<typeof createConfigRouter>;
  math: ReturnType<typeof createMathRouter>;
  help: ReturnType<typeof createHelpRouter>;
  test: ReturnType<typeof createTestRouter>;
  evolution: EvolutionRouter;
  // isles: IslesRouter;
  // oasis: OasisRouter;
  seer: SeerRouter;
  cerebro: CerebroRouter;
};

// Initialize tRPC with the merged context if needed
export const t = initTRPC
  .context<{
    app: any;
    // Define any shared context here if necessary
  }>()
  .create();

const applicationRouter = createApplicationRouter(new ApplicationService());
const configRouter = createConfigRouter(new ConfigService());
const mathRouter = createMathRouter(new MathService());
const helpRouter = createHelpRouter(new HelpService());
const testRouter = createTestRouter(new TestService());

export const router = t.router<MergedRouter>({
  application: applicationRouter,
  config: configRouter,
  math: mathRouter,
  help: helpRouter,
  test: testRouter,
  cerebro: createCerebroRouter(),
  seer: createSeerRouter(),
  evolution: createEvolutionRouter(),
  'seer-prod': createSeerRouter(),
  'evolution-prod': createEvolutionRouter(),
  // isles: createIslesRouter(),
  // oasis: createOasisRouter(),
});

const routers: any = {
  application: applicationRouter,
  config: configRouter,
  math: mathRouter,
  help: helpRouter,
  test: testRouter,
};

export type AppRouter = typeof router;

// const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create();

// const router = trpc.router({
//   application: createApplicationRouter(new ApplicationService()),
//   config: createConfigRouter(new ConfigService()),
//   math: createMathRouter(new MathService()),
//   help: createHelpRouter(new HelpService()),
// });

// ======================
// Helper Functions
// ======================

/**
 * Wait until a predicate is true or timeout occurs.
 */
function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();

  if (predicate()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const checkCondition = () => {
      if (predicate()) {
        resolve();
      } else if (Date.now() - startTime >= timeoutMs) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(checkCondition, intervalMs);
      }
    };

    setTimeout(checkCondition, intervalMs);
  });
}

/**
 * Handles TRPC errors by parsing and logging them.
 */
export const handleTRPCError = (
  error: any,
  message = 'There was an error while performing your request'
) => {
  try {
    const parsedError = JSON.parse(error.message);
    console.error(message, parsedError);
  } catch (e) {
    console.error(message, error);
  }
};

// ======================
// WebSocket Client Setup
// ======================

type BackendConfig = {
  name: string;
  url?: string;
};
console.log(process.env);
const backends: BackendConfig[] = [
  { name: 'application' },
  { name: 'config' },
  { name: 'math' },
  { name: 'help' },
  { name: 'test' },
  { name: 'isles', url: process.env.ISLES_SERVICE_URI },
  { name: 'oasis', url: process.env.OASIS_SERVICE_URI },
  { name: 'cerebro', url: process.env.CEREBRO_SERVICE_URI },
  { name: 'seer', url: process.env.LOCAL_SEER_SERVICE_URI },
  { name: 'evolution', url: process.env.LOCAL_EVOLUTION_SERVICE_URI },
  { name: 'seer-prod', url: process.env.PROD_SEER_SERVICE_URI },
  { name: 'evolution-prod', url: process.env.PROD_EVOLUTION_SERVICE_URI },
];

// Initialize socket clients for each backend
type Client = {
  ioCallbacks: Record<
    string,
    {
      timeout: any;
      resolve: (response: any) => void;
      reject: (error: any) => void;
    }
  >;
  socket: ReturnType<typeof ioClient>;
};

const clients: Record<string, Client> = {};

backends.forEach((backend) => {
  if (!backend.url) return;

  try {
    const client: Client = {
      ioCallbacks: {},
      socket: ioClient(backend.url, {
        transports: ['websocket'],
        upgrade: false,
        autoConnect: true, // Consider setting to false and connecting manually if needed
      }),
    };

    // Handle incoming socket events
    client.socket.onAny((eventName, res) => {
      try {
        // console.log(`[${backend.name} Socket] Event:`, eventName, res);

        if (eventName === 'Events') return;

        const { id } = res;

        if (id) {
          if (client.ioCallbacks[id]) {
            // console.log(`[${backend.name} Socket] Callback exists for ID:`, id);

            clearTimeout(client.ioCallbacks[id].timeout);

            try {
              client.ioCallbacks[id].resolve(res);
            } catch (e) {
              console.log(`[${backend.name} Socket] Callback error:`, e);
              client.ioCallbacks[id].reject(e);
            }

            delete client.ioCallbacks[id];
          } else {
            console.warn(`[${backend.name} Socket] No callback found for ID: ${id}`);
          }
        } else {
          const { method, params } = res;

          console.log(`[${backend.name} Socket] TRPC method called:`, method, params);

          try {
            // Implement your method handling logic here
            const result = {}; // Replace with actual result

            client.socket.emit('trpcResponse', {
              id,
              result: serialize(result),
            });
          } catch (e) {
            client.socket.emit('trpcResponse', {
              id,
              result: {},
              error: e.message,
            });
          }
        }
      } catch (e) {
        console.error(`[${backend.name} Socket] Error in handler:`, e);
      }
    });

    clients[backend.name] = client;
  } catch (e) {
    console.log('Failed to setup trpc backend', backend.url);
  }
});

// ======================
// Combined TRPC Link
// ======================
const getNestedMethod = (obj, path) => {
  const res = path.split('.').reduce((current, key) => {
    if (current[key] === undefined) {
      throw new Error(`Method "${key}" not found in path "${path}"`);
    }
    return current[key];
  }, obj);

  if (typeof res !== 'function') {
    throw new Error(`"${path}" is not a function`);
  }

  return res;
};

export const link: TRPCLink<any> =
  (ctx: any) =>
  () =>
  ({ op, next }) => {
    // Extract the router namespace from the operation path
    const [routerName, ...restPath] = op.path.split('.');

    if (!routerName || !backends.some((backend) => backend.name === routerName)) {
      return observable((observer) => {
        observer.error(new TRPCClientError(`Unknown router: ${routerName}`));
        observer.complete();
      });
    }

    console.log(routerName);

    const client = clients[routerName];

    const uuid = generateShortId();

    return observable((observer) => {
      const execute = async () => {
        const { input } = op;

        if (client) {
          op.context.client = client;
          // @ts-ignore
          op.context.client.roles = ['admin', 'user', 'guest'];

          try {
            await waitUntil(() => !!client?.socket?.emit, 60 * 1000);
          } catch (error: any) {
            console.log(`[${routerName} Link] Emit failed, no socket connection in time`, op);
            observer.error(new TRPCClientError(error.message));
            return;
          }

          console.log(`[${routerName} Link] Emit Direct:`, op);

          client.socket.emit('trpc', {
            id: uuid,
            method: op.path.replace(routerName + '.', ''),
            type: op.type,
            params: serialize(input),
          });

          // Save the ID and callback
          const timeout = setTimeout(() => {
            console.log(`[${routerName} Link] Request timed out:`, op);
            delete client.ioCallbacks[uuid];
            // observer.error(new TRPCClientError('Request timeout'));
          }, 15000); // 15 seconds timeout

          client.ioCallbacks[uuid] = {
            timeout,
            resolve: (pack) => {
              // console.log(
              //   `[${routerName} Link] Callback resolved:`,
              //   uuid,
              //   pack
              // );
              clearTimeout(timeout);
              const result =
                typeof pack.result === 'string' ? deserialize(pack.result) : pack.result;

              if (result?.error) {
                observer.error(result?.error);
              } else {
                observer.next({
                  result: result ? result : { data: undefined },
                });
                observer.complete();
              }
              delete client.ioCallbacks[uuid];
            },
            reject: (error) => {
              console.log(`[${routerName} Link] Callback rejected:`, error);
              clearTimeout(timeout);
              observer.error(error);
              delete client.ioCallbacks[uuid];
            },
          };
        } else {
          // const createCallerFactory =
          //   params.createCallerFactory ||
          //   (trpcServer.initTRPC.context<Context>().create({})
          //     .createCallerFactory as CreateCallerFactoryLike);

          // const caller = createCallerFactory(router)();
          const methodPath = op.path.replace(routerName + '.', '');

          console.log(
            'Calling local router',
            routerName,
            methodPath,
            op.type,
            input,
            routers[routerName]
          );

          const caller = t.createCallerFactory(routers[routerName])(ctx);

          const method = getNestedMethod(caller, methodPath);

          // const caller = t.createCallerFactory(routers[routerName])(ctx);

          const res = await method(input);

          console.log(res);
        }
      };

      execute();
    });
  };

// ======================
// Create a Unified tRPC Instance
// ======================

// Create a single tRPC instance

// Create the tRPC client with the combined link
// export const trpcClient = createTRPCProxyClient<AppRouter>({
//   links: [link],
// });

// export const trpcClient = trpc.createClient({
//   links: [combinedLink],
// });
