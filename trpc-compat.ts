import type { AnyRouter as TRPCAnyRouter, AnyProcedure as TRPCAnyProcedure } from '@trpc/server';

/**
 * Types that approximate tRPC router/procedure internals closely enough for CLI metadata inspection.
 * They intentionally stay structural so the package can work across the v10/v11 shapes in this repo.
 */
type RouterConfigLike = {
  $types: {
    meta: unknown;
    ctx: unknown;
  };
};

type RouterDefLike = {
  _config: RouterConfigLike;
  procedures: Record<string, AnyProcedure>;
};

export type Trpc11ProcedureLike = {
  _def: {
    type: 'mutation' | 'query' | 'subscription';
    meta?: unknown;
    inputs?: unknown[];
    $types: { input: unknown; output: unknown };
  };
};

export type Trpc10ProcedureLike = {
  _def: {
    mutation?: boolean;
    query?: boolean;
    subscription?: boolean;
    meta?: unknown;
    inputs: unknown[];
    _input_in: unknown;
    _output_out: unknown;
  };
};

export type Trpc11RouterLike = {
  _def: RouterDefLike & {
    procedures: Record<string, Trpc11ProcedureLike>;
  };
};

export type Trpc10RouterLike = {
  _def: RouterDefLike & {
    procedures: Record<string, Trpc10ProcedureLike>;
  };
};

export type CreateCallerFactoryLike = (
  router: unknown
) => (context: unknown) => Record<string, (input: unknown) => unknown>;

export type AnyRouter = TRPCAnyRouter | Trpc10RouterLike | Trpc11RouterLike;

export type AnyProcedure = TRPCAnyProcedure | Trpc10ProcedureLike | Trpc11ProcedureLike;

export type RouterProcedureKey<R extends AnyRouter> = R extends {
  _def: { procedures: infer Procedures };
}
  ? Extract<keyof Procedures, string>
  : never;

export type InferRouterContext<R extends AnyRouter> = R extends {
  _def: { _config: { $types: { ctx: infer Context } } };
}
  ? Context
  : unknown;

export const isTrpc11Procedure = (procedure: AnyProcedure): procedure is Trpc11ProcedureLike => {
  return '_def' in procedure && 'type' in procedure._def && typeof procedure._def.type === 'string';
};

export const isTrpc11Router = (router: AnyRouter): router is Trpc11RouterLike => {
  const procedure = Object.values(router._def.procedures)[0] as AnyProcedure | undefined;
  return procedure ? isTrpc11Procedure(procedure) : false;
};
