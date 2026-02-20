import type { JsonSchema7Type } from 'zod-to-json-schema';
import type { AnyRouter, CreateCallerFactoryLike, InferRouterContext } from './trpc-compat';

export type TrpcCliParams<R extends AnyRouter> = {
  router: R;
  link?: any;
  context?: InferRouterContext<R>;
  alias?: (
    fullName: string,
    meta: { command: string; flags: Record<string, unknown> }
  ) => string | undefined;
  default?: {
    procedure: keyof R['_def']['procedures'];
  };
  createCallerFactory?: CreateCallerFactoryLike;
};

export interface TrpcCliMeta {
  version?: string;
  description?: string;
  usage?: false | string | string[];
  examples?: string | string[];
}

export interface ParsedProcedure {
  parameters: string[];
  flagsSchema: JsonSchema7Type;
  getInput: (argv: { _: string[]; flags: Record<string, unknown> }) => unknown;
}

export type Result<T> = { success: true; value: T } | { success: false; error: string };

export type Log = (...args: unknown[]) => void;

export interface Logger {
  info?: Log;
  error?: Log;
}
