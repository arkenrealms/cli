import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { io as ioClient, type Socket } from 'socket.io-client';
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

import dotEnv from 'dotenv';
dotEnv.config();

const isLocal = process.env.ARKEN_ENV === 'local';

type RouteFactory = () => any;
type RouteDef = {
  local?: RouteFactory;
  remoteUrl?: () => string | undefined;
  create?: RouteFactory;
};

const ROUTE_KEYS = [
  'application',
  'config',
  'math',
  'help',
  'test',
  'cerebro',
  'seer',
  'seer-prd',
  'evolution',
  'evolution-prd',
  'evolution-dev',
] as const;

type RouteKey = (typeof ROUTE_KEYS)[number];

const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_CEREBRO_REQUEST_TIMEOUT_MS = 300_000;

const clampRequestTimeoutMs = (value: number, fallback: number) => {
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1_000, Math.min(900_000, normalized));
};

export function resolveRouteRequestTimeoutMs(routeKey: RouteKey, env: NodeJS.ProcessEnv = process.env): number {
  const routeKeyPrefix = routeKey.toUpperCase().replace(/-/g, '_');
  const defaultValue = routeKey === 'cerebro' ? DEFAULT_CEREBRO_REQUEST_TIMEOUT_MS : DEFAULT_REMOTE_REQUEST_TIMEOUT_MS;
  const candidates = [
    env[`ARKEN_CLI_${routeKeyPrefix}_REQUEST_TIMEOUT_MS`],
    routeKey === 'cerebro' ? env.ARKEN_CLI_CEREBRO_REQUEST_TIMEOUT_MS : undefined,
    env.ARKEN_CLI_REMOTE_REQUEST_TIMEOUT_MS,
  ];

  for (const candidate of candidates) {
    const numeric = Number.parseInt(String(candidate || '').trim(), 10);
    if (Number.isFinite(numeric) && numeric > 0) {
      return clampRequestTimeoutMs(numeric, defaultValue);
    }
  }

  return defaultValue;
}

const createApplicationRoute = () => {
  return createApplicationRouter(new ApplicationService());
};

const createConfigRoute = () => {
  return createConfigRouter(new ConfigService());
};

const createMathRoute = () => {
  return createMathRouter(new MathService());
};

const createHelpRoute = () => {
  return createHelpRouter(new HelpService());
};

const createTestRoute = () => {
  return createTestRouter(new TestService());
};

const createStubRemoteError = (methodName: string) => async () => {
  throw new Error(`Remote route "${methodName}" is unavailable in local CLI mode`);
};

const createCerebroProtocolRouter = () => {
  const { createRouter } = require('@arken/cerebro-protocol') as typeof import('@arken/cerebro-protocol');
  return createRouter({
    ask: createStubRemoteError('cerebro.ask'),
    exec: createStubRemoteError('cerebro.exec'),
    info: createStubRemoteError('cerebro.info'),
  });
};

const ROUTES: Record<RouteKey, RouteDef> = {
  application: { local: createApplicationRoute },
  config: { local: createConfigRoute },
  math: { local: createMathRoute },
  help: { local: createHelpRoute },
  test: { local: createTestRoute },
  cerebro: {
    remoteUrl: () => process.env.CEREBRO_SERVICE_URI,
    create: createCerebroProtocolRouter,
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
};

const getRouteDef = (routeKey: RouteKey): RouteDef => ROUTES[routeKey];

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
  return Boolean(getRouteDef(routeKey).local);
};

export const t = initTRPC.context<{ app: any; router?: any }>().create();

let localRoutersCache: Partial<Record<RouteKey, any>> | undefined;
let protocolRoutersCache: Partial<Record<RouteKey, any>> | undefined;
let routerCache: ReturnType<typeof buildRouter> | undefined;

function getLocalRouters(): Partial<Record<RouteKey, any>> {
  if (localRoutersCache) {
    return localRoutersCache;
  }

  localRoutersCache = Object.fromEntries(
    ROUTE_KEYS.flatMap((routeKey) => {
      const route = getRouteDef(routeKey);
      return route.local && shouldInstantiateRoute(routeKey) ? [[routeKey, route.local()]] : [];
    })
  ) as Partial<Record<RouteKey, any>>;

  return localRoutersCache;
}

function getProtocolRouters(): Partial<Record<RouteKey, any>> {
  if (protocolRoutersCache) {
    return protocolRoutersCache;
  }

  protocolRoutersCache = Object.fromEntries(
    ROUTE_KEYS.flatMap((routeKey) => {
      const route = getRouteDef(routeKey);
      if (!route.create || !shouldInstantiateRoute(routeKey)) return [];

      try {
        return [[routeKey, route.create()]];
      } catch {
        return [];
      }
    })
  ) as Partial<Record<RouteKey, any>>;

  return protocolRoutersCache;
}

function buildRouter() {
  return t.router({
    ...(getLocalRouters() as any),
    ...(getProtocolRouters() as any),
  });
}

function getRouter() {
  return (routerCache ??= buildRouter());
}

export type AppRouter = ReturnType<typeof buildRouter>;

const bindRouterValue = (routerValue: unknown, actualRouter: AppRouter) => {
  return typeof routerValue === 'function' ? routerValue.bind(actualRouter) : routerValue;
};

export const router = new Proxy({} as Record<string, unknown>, {
  get(_target, property, _receiver) {
    const actualRouter = getRouter();
    return bindRouterValue(Reflect.get(actualRouter as object, property, actualRouter), actualRouter);
  },
  has(_target, property) {
    return property in getRouter();
  },
  ownKeys() {
    return Reflect.ownKeys(getRouter());
  },
  getOwnPropertyDescriptor(_target, property) {
    const actualRouter = getRouter();
    const descriptor = Object.getOwnPropertyDescriptor(actualRouter, property);
    if (!descriptor) {
      return undefined;
    }

    if ('value' in descriptor) {
      descriptor.value = bindRouterValue(descriptor.value, actualRouter);
    }

    return {
      ...descriptor,
      configurable: true,
    };
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(getRouter());
  },
}) as AppRouter;

type Client = {
  ioCallbacks: Record<string, any>;
  socket: Socket;
};

const clients: Partial<Record<RouteKey, Client>> = {};

function getBackends(): BackendConfig[] {
  return ROUTE_KEYS.flatMap((routeKey) => {
    if (!shouldInstantiateRoute(routeKey)) return [];

    const url = getRouteDef(routeKey).remoteUrl?.();
    return url ? [{ name: routeKey, url }] : [];
  });
}

function getOrCreateClient(routeKey: RouteKey): Client | undefined {
  const existingClient = clients[routeKey];
  if (existingClient) return existingClient;

  const url = getRouteDef(routeKey).remoteUrl?.();
  if (!url) return undefined;

  const client: Client = {
    ioCallbacks: {},
    socket: ioClient(url, {
      transports: ['websocket'],
      upgrade: false,
      autoConnect: true,
      autoUnref: true,
    }),
  };

  attachTrpcResponseHandler({
    client,
    backendName: routeKey,
    logging: false,
    preferOnAny: true,
  });

  clients[routeKey] = client;
  return client;
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

function hasProcedure(routerCandidate: any, procedurePath: string) {
  const procedures = routerCandidate?._def?.procedures;
  return Boolean(procedures && Object.prototype.hasOwnProperty.call(procedures, procedurePath));
}

function createRemoteOperationLink(runtime: Parameters<TRPCLink<any>>[0], routeKey: RouteKey) {
  const client = getOrCreateClient(routeKey);
  const url = getRouteDef(routeKey).remoteUrl?.();
  if (!client || !url) {
    throw new TRPCClientError(`Remote route unavailable: ${routeKey}`);
  }

  return createSocketLink({
    backends: [{ name: routeKey, url }],
    clients: { [routeKey]: client },
    waitUntil: (predicate) => waitUntil(predicate, 15_000),
    notifyTRPCError: () => undefined,
    requestTimeoutMs: resolveRouteRequestTimeoutMs(routeKey),
  })(runtime);
}

function createOperationLink(runtime: Parameters<TRPCLink<any>>[0]) {
  const remoteOperationLinks: Partial<Record<RouteKey, ReturnType<TRPCLink<any>>>> = {};

  const getRemoteOperationLink = (routeKey: RouteKey) => {
    return (remoteOperationLinks[routeKey] ??= createRemoteOperationLink(runtime, routeKey));
  };

  return ({ op, next }) => {
    const [routerNameRaw, ...restPath] = op.path.split('.');
    const routeKey =
      routerNameRaw && ROUTE_KEYS.includes(routerNameRaw as RouteKey)
        ? (routerNameRaw as RouteKey)
        : undefined;
    const boundRouter = (runtime as any)?.router;
    const shouldPreferBoundRouter =
      boundRouter && boundRouter !== router && hasProcedure(boundRouter, op.path);

    if (shouldPreferBoundRouter) {
      return observable((observer) => {
        const execute = async () => {
          try {
            const caller = t.createCallerFactory(boundRouter)(runtime as any);
            const method = getNestedMethod(caller, op.path);
            const result = await method(op.input);
            observer.next({ result: { data: result } });
            observer.complete();
          } catch (error: any) {
            observer.error(
              error instanceof TRPCClientError ? error : new TRPCClientError(error?.message ?? String(error))
            );
          }
        };

        void execute();
      });
    }

    if (routeKey) {
      const remoteClient = getOrCreateClient(routeKey);
      if (remoteClient) {
        return getRemoteOperationLink(routeKey)({ op, next });
      }
    }

    return observable((observer) => {
      const execute = async () => {
        try {
          const localRouters = getLocalRouters();
          let localRouter: any;
          let methodPath: string;

          if (routeKey && localRouters[routeKey] && restPath.length > 0) {
            localRouter = localRouters[routeKey];
            methodPath = restPath.join('.');
          } else if ((runtime as any)?.router) {
            localRouter = (runtime as any).router;
            methodPath = op.path;
          } else if (routeKey && localRouters[routeKey]) {
            localRouter = localRouters[routeKey];
            methodPath = routeKey;
          } else {
            throw new TRPCClientError(`Unknown router: ${routerNameRaw}`);
          }

          const caller = t.createCallerFactory(localRouter)(runtime as any);
          const method = getNestedMethod(caller, methodPath);
          const result = await method(op.input);
          observer.next({ result: { data: result } });
          observer.complete();
        } catch (error: any) {
          observer.error(
            error instanceof TRPCClientError ? error : new TRPCClientError(error?.message ?? String(error))
          );
        }
      };

      void execute();
    });
  };
}

function looksLikeBoundRuntime(value: unknown): value is { app?: unknown; router?: unknown } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ('app' in (value as Record<string, unknown>) || 'router' in (value as Record<string, unknown>))
  );
}

export const link: TRPCLink<any> = ((runtimeOrPreset: Parameters<TRPCLink<any>>[0]) => {
  if (looksLikeBoundRuntime(runtimeOrPreset)) {
    return () => createOperationLink(runtimeOrPreset);
  }

  return createOperationLink(runtimeOrPreset);
}) as TRPCLink<any>;
