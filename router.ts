import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { io as ioClient } from 'socket.io-client';
import {
  attachTrpcResponseHandler,
  createSocketLink,
  type BackendConfig,
} from '@arken/node/trpc/socketLink';

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
import { createRouter as createCerebroRouter } from '@arken/cerebro-protocol';

import dotEnv from 'dotenv';
dotEnv.config();

const isLocal = process.env.ARKEN_ENV === 'local';

type RouteDef = {
  local?: () => any;
  remoteUrl?: () => string | undefined;
  create?: () => any;
};

const ROUTES = {
  application: { local: () => createApplicationRouter(new ApplicationService()) },
  config: { local: () => createConfigRouter(new ConfigService()) },
  math: { local: () => createMathRouter(new MathService()) },
  help: { local: () => createHelpRouter(new HelpService()) },
  test: { local: () => createTestRouter(new TestService()) },
  cerebro: {
    remoteUrl: () => process.env.CEREBRO_SERVICE_URI,
    create: () => createCerebroRouter(),
  },
  seer: {
    remoteUrl: () => process.env['SEER_SERVICE_URI' + (isLocal ? '_LOCAL' : '')],
    create: () => require('@arken/seer-protocol').createRouter({} as any),
  },
  'seer-prd': {
    remoteUrl: () => process.env.SEER_SERVICE_URI,
    create: () => require('@arken/seer-protocol').createRouter({} as any),
  },
  evolution: {
    remoteUrl: () => process.env['EVOLUTION_SERVICE_URI' + (isLocal ? '_LOCAL' : '')],
    create: () => require('@arken/evolution-protocol/realm/realm.router').createRouter({} as any),
  },
  'evolution-prd': {
    remoteUrl: () => process.env.EVOLUTION_SERVICE_URI,
    create: () => require('@arken/evolution-protocol/realm/realm.router').createRouter({} as any),
  },
  'evolution-dev': {
    remoteUrl: () => process.env.EVOLUTION_SERVICE_URI_DEV,
    create: () => require('@arken/evolution-protocol/realm/realm.router').createRouter({} as any),
  },
} satisfies Record<string, RouteDef>;

type RouteKey = keyof typeof ROUTES;
const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

const resolveRequestedRoute = (): RouteKey | undefined => {
  const command = process.argv[2];
  if (!command) return undefined;
  const [namespace] = command.split('.');
  if (!namespace) return undefined;
  if (!ROUTE_KEYS.includes(namespace as RouteKey)) return undefined;
  return namespace as RouteKey;
};

const requestedRoute = resolveRequestedRoute();

const shouldInstantiateRoute = (routeKey: RouteKey) => {
  if (!requestedRoute) return true;
  if (routeKey === requestedRoute) return true;
  return Boolean(ROUTES[routeKey].local);
};

export const t = initTRPC.context<{ app: any; router?: any }>().create();

const localRouters = Object.fromEntries(
  ROUTE_KEYS.flatMap((k) => (ROUTES[k].local && shouldInstantiateRoute(k) ? [[k, ROUTES[k].local!()]] : []))
) as Partial<Record<RouteKey, any>>;

export const router = t.router({
  ...(localRouters as any),
  ...Object.fromEntries(
    ROUTE_KEYS.flatMap((k) => {
      if (!ROUTES[k].create || !shouldInstantiateRoute(k)) return [];
      try {
        return [[k, ROUTES[k].create!()]];
      } catch {
        return [];
      }
    })
  ),
});

export type AppRouter = typeof router;

const backends: BackendConfig[] = ROUTE_KEYS.flatMap((name) => {
  if (!shouldInstantiateRoute(name)) return [];
  const url = ROUTES[name].remoteUrl?.();
  return url ? [{ name, url }] : [];
});

type Client = {
  ioCallbacks: Record<string, any>;
  socket: ReturnType<typeof ioClient>;
};

const clients: Record<string, Client> = {};
for (const backend of backends) {
  const client: Client = {
    ioCallbacks: {},
    socket: ioClient(backend.url, {
      transports: ['websocket'],
      upgrade: false,
      autoConnect: true,
      autoUnref: true,
    }),
  };

  attachTrpcResponseHandler({
    client,
    backendName: backend.name,
    logging: false,
    preferOnAny: true,
  });

  clients[backend.name] = client;
}

function waitUntil(predicate: () => boolean, timeoutMs: number, intervalMs = 100): Promise<void> {
  const start = Date.now();
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start >= timeoutMs) return reject(new Error('Timeout waiting for condition'));
      setTimeout(check, intervalMs);
    };
    setTimeout(check, intervalMs);
  });
}

function getNestedMethod(obj: any, path: string) {
  const fn = path.split('.').reduce((curr, key) => {
    if (curr?.[key] === undefined) throw new Error(`Method "${key}" not found in "${path}"`);
    return curr[key];
  }, obj);
  if (typeof fn !== 'function') throw new Error(`"${path}" is not a function`);
  return fn;
}

const remoteLink = createSocketLink({
  backends,
  clients,
  waitUntil: (predicate) => waitUntil(predicate, 15_000),
  notifyTRPCError: () => undefined,
  requestTimeoutMs: 15_000,
});

export const link: TRPCLink<any> =
  (ctx) =>
  () =>
  ({ op }) => {
    const [routerNameRaw, ...restPath] = op.path.split('.');

    if (routerNameRaw && clients[routerNameRaw]) {
      return (remoteLink(ctx) as any)({ op });
    }

    return observable((observer) => {
      const execute = async () => {
        try {
          let localRouter: any;
          let methodPath: string;

          if (
            routerNameRaw &&
            ROUTE_KEYS.includes(routerNameRaw as RouteKey) &&
            localRouters[routerNameRaw as RouteKey] &&
            restPath.length > 0
          ) {
            localRouter = localRouters[routerNameRaw as RouteKey];
            methodPath = restPath.join('.');
          } else if ((ctx as any)?.router) {
            localRouter = (ctx as any).router;
            methodPath = op.path;
          } else if (
            routerNameRaw &&
            ROUTE_KEYS.includes(routerNameRaw as RouteKey) &&
            localRouters[routerNameRaw as RouteKey]
          ) {
            localRouter = localRouters[routerNameRaw as RouteKey];
            methodPath = routerNameRaw;
          } else {
            throw new TRPCClientError(`Unknown router: ${routerNameRaw}`);
          }

          const caller = t.createCallerFactory(localRouter)(ctx as any);
          const method = getNestedMethod(caller, methodPath);
          const result = await method(op.input);
          observer.next({ result: { data: result } });
          observer.complete();
        } catch (error: any) {
          observer.error(error instanceof TRPCClientError ? error : new TRPCClientError(error?.message ?? String(error)));
        }
      };

      void execute();
    });
  };
