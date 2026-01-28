import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';

import { TRPCClientError } from '@trpc/client';
import { TRPCLink } from '@trpc/react-query';

import { io as ioClient } from 'socket.io-client';
import { serialize, deserialize } from '@arken/node/rpc';
import { generateShortId } from '@arken/node/db';

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

import {
  createRouter as createEvolutionRouter,
  Router as EvolutionRouter,
} from '@arken/evolution-protocol/realm/realm.router';
import { createRouter as createSeerRouter, Router as SeerRouter } from '@arken/seer-protocol';
import {
  createRouter as createCerebroRouter,
  Router as CerebroRouter,
} from '@arken/cerebro-protocol';

import dotEnv from 'dotenv';
dotEnv.config();

const isLocal = process.env.ARKEN_ENV === 'local';

/** ---------------------------
 * Single source of truth
 * - key = router namespace used in op.path ("seer-prd.*")
 * - local(): local router factory (optional)
 * - remote: socket backend URL resolver (optional)
 * - create(): remote router factory (optional; only used for typing/merged tRPC router)
 * -------------------------- */
type RouteDef =
  | {
      local: () => any;
      remote?: never;
      create?: never;
    }
  | {
      local?: never;
      remote: { url: () => string | undefined };
      create: () => any;
    }
  | {
      local: () => any;
      remote: { url: () => string | undefined };
      create: () => any;
    };

const ROUTES = {
  // local-only
  application: {
    local: () => createApplicationRouter(new ApplicationService()),
  },
  config: {
    local: () => createConfigRouter(new ConfigService()),
  },
  math: {
    local: () => createMathRouter(new MathService()),
  },
  help: {
    local: () => createHelpRouter(new HelpService()),
  },
  test: {
    local: () => createTestRouter(new TestService()),
  },

  // remote-only (or remote-typed)
  cerebro: {
    remote: { url: () => process.env.CEREBRO_SERVICE_URI },
    create: () => createCerebroRouter(),
  },

  seer: {
    remote: { url: () => process.env['SEER_SERVICE_URI' + (isLocal ? '_LOCAL' : '')] },
    create: () => createSeerRouter(),
  },
  'seer-prd': {
    remote: { url: () => process.env.SEER_SERVICE_URI },
    create: () => createSeerRouter(),
  },

  evolution: {
    remote: { url: () => process.env['EVOLUTION_SERVICE_URI' + (isLocal ? '_LOCAL' : '')] },
    create: () => createEvolutionRouter(),
  },
  'evolution-prd': {
    remote: { url: () => process.env.EVOLUTION_SERVICE_URI },
    create: () => createEvolutionRouter(),
  },
  'evolution-dev': {
    remote: { url: () => process.env.EVOLUTION_SERVICE_URI_DEV },
    create: () => createEvolutionRouter(),
  },

  // If you re-enable these later, add them here once and everything else updates automatically:
  // isles: { remote: { url: () => process.env.ISLES_SERVICE_URI }, create: () => createIslesRouter() },
  // oasis: { remote: { url: () => process.env.OASIS_SERVICE_URI }, create: () => createOasisRouter() },
} satisfies Record<string, RouteDef>;

type RouteKey = keyof typeof ROUTES;
const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

/** Derive merged router type from ROUTES */
type RouterFor<K extends RouteKey> = (typeof ROUTES)[K] extends { local: () => infer R }
  ? R
  : (typeof ROUTES)[K] extends { create: () => infer R }
    ? R
    : never;

type MergedRouter = { [K in RouteKey]: RouterFor<K> };

/** tRPC init */
export const t = initTRPC
  .context<{
    app: any;
  }>()
  .create();

/** Build local routers once (so you don't create services multiple times) */
const localRouters = Object.fromEntries(
  ROUTE_KEYS.flatMap((k) => {
    const def = ROUTES[k];
    return 'local' in def ? [[k, def.local()]] : [];
  })
) as Partial<Record<RouteKey, any>>;

/** Export the full merged router (local entries use instances; remote entries use create()) */
export const router = t.router<MergedRouter>({
  // local
  ...(localRouters as any),

  // remote-typed routers (used for client typing / namespace shape)
  ...Object.fromEntries(
    ROUTE_KEYS.flatMap((k) => {
      const def = ROUTES[k];
      return 'create' in def ? [[k, def.create()]] : [];
    })
  ),
});

export type AppRouter = typeof router;

/** Local router map used by the link fallback path */
const routers = localRouters as Record<string, any>;

/** ---------------------------
 * backends derived from ROUTES
 * -------------------------- */
type BackendConfig<K extends RouteKey = RouteKey> = {
  name: K;
  url: string;
};

const backends: BackendConfig[] = ROUTE_KEYS.flatMap((name) => {
  const def = ROUTES[name];
  if (!('remote' in def)) return [];
  const url = def.remote.url();
  if (!url) return [];
  return [{ name, url }];
});

/** ---------------------------
 * socket clients from backends
 * -------------------------- */
type Client = {
  ioCallbacks: Record<
    string,
    { timeout: any; resolve: (response: any) => void; reject: (error: any) => void }
  >;
  socket: ReturnType<typeof ioClient>;
};

const clients: Partial<Record<RouteKey, Client>> = {};

for (const backend of backends) {
  const client: Client = {
    ioCallbacks: {},
    socket: ioClient(backend.url, {
      transports: ['websocket'],
      upgrade: false,
      autoConnect: true,
    }),
  };

  client.socket.onAny((eventName, res) => {
    try {
      if (eventName === 'Events') return;

      const { id } = res ?? {};
      if (id && client.ioCallbacks[id]) {
        clearTimeout(client.ioCallbacks[id].timeout);
        try {
          client.ioCallbacks[id].resolve(res);
        } catch (e) {
          client.ioCallbacks[id].reject(e);
        } finally {
          delete client.ioCallbacks[id];
        }
      }
    } catch (e) {
      console.error(`[${backend.name} Socket] Error in handler:`, e);
    }
  });

  clients[backend.name] = client;
}

/** ---------------------------
 * Helpers
 * -------------------------- */
function waitUntil(predicate: () => boolean, timeoutMs: number, intervalMs = 100): Promise<void> {
  const startTime = Date.now();
  if (predicate()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) resolve();
      else if (Date.now() - startTime >= timeoutMs)
        reject(new Error('Timeout waiting for condition'));
      else setTimeout(check, intervalMs);
    };
    setTimeout(check, intervalMs);
  });
}

const getNestedMethod = (obj: any, path: string) => {
  const res = path.split('.').reduce((current, key) => {
    if (current?.[key] === undefined) throw new Error(`Method "${key}" not found in "${path}"`);
    return current[key];
  }, obj);

  if (typeof res !== 'function') throw new Error(`"${path}" is not a function`);
  return res;
};

/** ---------------------------
 * Combined TRPC Link
 * -------------------------- */
export const link: TRPCLink<any> =
  (ctx: any) =>
  () =>
  ({ op }) => {
    const [routerNameRaw, ...restPath] = op.path.split('.');
    const routerName = routerNameRaw as RouteKey;

    if (!routerNameRaw || !ROUTE_KEYS.includes(routerName)) {
      return observable((observer) => {
        observer.error(new TRPCClientError(`Unknown router: ${routerNameRaw}`));
        observer.complete();
      });
    }

    const client = clients[routerName];
    const uuid = generateShortId();

    return observable((observer) => {
      const execute = async () => {
        const { input } = op;

        // Remote path
        if (client) {
          op.context.client = client;
          // @ts-ignore
          op.context.client.roles = ['admin', 'mod', 'user', 'guest'];

          try {
            await waitUntil(() => !!client?.socket?.emit, 60_000);
          } catch (err: any) {
            observer.error(new TRPCClientError(err.message));
            return;
          }

          client.socket.emit('trpc', {
            id: uuid,
            method: op.path.replace(routerName + '.', ''),
            type: op.type,
            params: serialize(input),
          });

          const timeout = setTimeout(() => {
            delete client.ioCallbacks[uuid];
            // observer.error(new TRPCClientError('Request timeout'));
          }, 15_000);

          client.ioCallbacks[uuid] = {
            timeout,
            resolve: (pack) => {
              clearTimeout(timeout);
              const result =
                typeof pack.result === 'string' ? deserialize(pack.result) : pack.result;

              if (result?.error) observer.error(result.error);
              else {
                observer.next({ result: { data: result ?? undefined } });
                observer.complete();
              }
            },
            reject: (error) => {
              clearTimeout(timeout);
              observer.error(error);
            },
          };

          return;
        }

        // Local fallback path
        const local = routers[routerName];
        if (!local) {
          observer.error(new TRPCClientError(`No local router for: ${routerName}`));
          return;
        }

        const methodPath = restPath.join('.');
        const caller = t.createCallerFactory(local)(ctx);
        const method = getNestedMethod(caller, methodPath);
        const res = await method(input);

        observer.next({ result: { data: res } });
        observer.complete();
      };

      void execute();
    });
  };
