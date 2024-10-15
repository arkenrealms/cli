import type {
  AnyRouter as TRPCAnyRouter,
  AnyProcedure as TRPCAnyProcedure,
} from "@trpc/server";

/**
 * Types that approximate a tRPC v11 router and procedure to infer types correctly.
 * Written to avoid direct dependency on @trpc/server v11+.
 */
export type Trpc11RouterLike = {
  _def: {
    _config: {
      $types: { meta: unknown; ctx: unknown };
    };
    procedures: Record<
      string,
      | Trpc11ProcedureLike
      | Trpc11RouterLike
      | Record<string, Trpc11ProcedureLike>
    >;
  };
};

export type Trpc11ProcedureLike = {
  _def: {
    type: "mutation" | "query" | "subscription";
    meta?: unknown;
    inputs?: unknown[]; // Not exposed by tRPC v11 as of 11.0.0-rc.502
    $types: { input: unknown; output: unknown };
  };
};

export type Trpc10RouterLike = {
  _def: {
    _config: {
      $types: { meta: unknown; ctx: unknown };
    };
    procedures: Record<string, Trpc10ProcedureLike | Trpc10RouterLike>;
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

export type CreateCallerFactoryLike = (
  router: unknown
) => (context: unknown) => Record<string, (input: unknown) => unknown>;

export type AnyRouter = Trpc10RouterLike | Trpc11RouterLike | TRPCAnyRouter;

export type AnyProcedure =
  | Trpc10ProcedureLike
  | Trpc11ProcedureLike
  | TRPCAnyProcedure;

export type InferRouterContext<R extends AnyRouter> =
  R["_def"]["_config"]["$types"]["ctx"];

export const isTrpc11Procedure = (
  procedure: AnyProcedure
): procedure is Trpc11ProcedureLike => {
  return (
    "_def" in procedure &&
    "type" in procedure._def &&
    typeof procedure._def.type === "string"
  );
};

export const isTrpc11Router = (
  router: AnyRouter
): router is Trpc11RouterLike => {
  const procedure = Object.values(router._def.procedures)[0] as
    | AnyProcedure
    | undefined;
  return procedure ? isTrpc11Procedure(procedure) : false;
};
