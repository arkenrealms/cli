/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as trpcServer from '@trpc/server';
import * as cleye from 'cleye';
import colors from 'picocolors';
import { ZodError } from 'zod';
import { type JsonSchema7Type } from 'zod-to-json-schema';
import * as zodValidationError from 'zod-validation-error';
import argv from 'string-argv';
import { createTRPCProxyClient, TRPCClientError } from '@trpc/client';
import { flattenedProperties, incompatiblePropertyPairs, getDescription } from './json-schema';
import { lineByLineConsoleLogger } from './logging';
import { AnyProcedure, AnyRouter, isTrpc11Procedure } from './trpc-compat';
import { observable } from '@trpc/server/observable';
import { Logger, TrpcCliParams } from './types';
import { looksLikeInstanceof } from './util';

export * from './types';

export { z } from 'zod';
export * as zod from 'zod';

export * as trpcServer from '@trpc/server';

/** Re-export of the @trpc/server package to avoid needing to install manually when getting started */

export type { AnyRouter, AnyProcedure } from './trpc-compat';

type ProcedureType = 'mutation' | 'query' | 'subscription';

type ProcedureInfo = {
  name: string;
  procedure: AnyProcedure;
  jsonSchema: import('./types').ParsedProcedure;
  properties: Record<string, JsonSchema7Type>;
  incompatiblePairs: Array<[string, string]>;
  type: ProcedureType;
};

type FullCliState = {
  procedureEntries: Array<[string, ProcedureInfo]>;
  procedureMap: Record<string, ProcedureInfo>;
  cleyeCommands: CleyeCommandOptions[];
};

type ParsedCliArgv = ReturnType<typeof cleye.cli> & {
  command?: string;
  flags: Record<string, any>;
  unknownFlags: Record<string, unknown>;
  _: string[] & { '--': string[] };
};

export interface TrpcCli {
  run: (params?: {
    argv?: string[];
    logger?: Logger;
    process?: {
      stdin: NodeJS.ReadableStream;
      stdout: NodeJS.WritableStream;
      exit: (code: number) => never;
    };
  }) => Promise<void>;
  executeCommand: any;
  ignoredProcedures: { procedure: string; reason: string }[];
}

/**
 * Run a trpc router as a CLI.
 *
 * @param router A trpc router
 * @param link The TRPC link to use for client communication
 * @param params Additional parameters for CLI configuration
 * @returns A CLI object with a `run` method
 */
export function createCli<R extends AnyRouter>({
  router,
  link,
  ...params
}: TrpcCliParams<R>): TrpcCli {
  const linkFactory =
    link ??
    ((ctx: any) =>
      () =>
      ({ op }: any) =>
        observable<any>((observer) => {
          const execute = async () => {
            try {
              const localRouter = ctx?.router ?? router;
              const caller =
                typeof (localRouter as any).createCaller === 'function'
                  ? (localRouter as any).createCaller(ctx as any)
                  : (params.createCallerFactory
                      ? params.createCallerFactory(localRouter)
                      : trpcServer.initTRPC.context<any>().create().createCallerFactory(localRouter))(
                      ctx as any
                    );
              const method = op.path.split('.').reduce((curr: any, key: string) => {
                if (curr?.[key] === undefined) {
                  throw new Error(`Method "${key}" not found in "${op.path}"`);
                }
                return curr[key];
              }, caller);
              if (typeof method !== 'function') {
                throw new Error(`"${op.path}" is not a function`);
              }
              const result = await method(op.input);
              observer.next({ result: { data: result } });
              observer.complete();
            } catch (error: any) {
              observer.error(
                error instanceof TRPCClientError
                  ? error
                  : new TRPCClientError(error?.message ?? String(error))
              );
            }
          };

          void execute();
        }));
  const procedureRecord = router._def.procedures as Record<string, AnyProcedure>;
  const procedureSummaries = Object.entries(procedureRecord).map(([name, procedure]) => ({
    name,
    procedure,
  }));
  const summaryProcedureNames = new Set(procedureSummaries.map(({ name }) => name));
  const summaryCleyeCommands: CleyeCommandOptions[] = procedureSummaries.map(
    ({ name, procedure }) => ({
      name,
      help: procedure._def.meta,
    })
  );
  const ignoredProcedures: { procedure: string; reason: string }[] = [];
  let parseProcedureInputsPromise:
    | Promise<typeof import('./zod-procedure').parseProcedureInputs>
    | undefined;
  let parseProcedureInputsSync:
    | typeof import('./zod-procedure').parseProcedureInputs
    | undefined;
  let fullCliStatePromise: Promise<FullCliState> | undefined;
  let ignoredProceduresCache: { procedure: string; reason: string }[] | undefined;

  const getParseProcedureInputsSync = () => {
    return (parseProcedureInputsSync ??=
      (require('./zod-procedure') as typeof import('./zod-procedure')).parseProcedureInputs);
  };

  const loadParseProcedureInputs = async () => {
    return (parseProcedureInputsPromise ??= Promise.resolve().then(() => {
      return (
        require('./zod-procedure') as typeof import('./zod-procedure')
      ).parseProcedureInputs;
    }));
  };

  const getIgnoredProcedures = () => {
    if (ignoredProceduresCache) {
      return ignoredProceduresCache;
    }

    const parseProcedureInputs = getParseProcedureInputsSync();
    ignoredProceduresCache = Object.entries(procedureRecord).flatMap(([name, procedure]) => {
      const procedureInputs = Array.isArray((procedure._def as { inputs?: unknown[] }).inputs)
        ? ((procedure._def as { inputs?: unknown[] }).inputs as unknown[])
        : [];
      const procedureResult = parseProcedureInputs(procedureInputs);
      return procedureResult.success === false
        ? [{ procedure: name, reason: procedureResult.error }]
        : [];
    });

    return ignoredProceduresCache;
  };

  const buildCleyeCommands = (entries: Array<[string, ProcedureInfo]>): CleyeCommandOptions[] => {
    return entries.map(([commandName, { procedure, jsonSchema, properties }]) => {
      const flags = Object.fromEntries(
        Object.entries(properties).map(([propertyKey, propertyValue]) => {
          const cleyeType = getCleyeType(propertyValue);

          let description: string | undefined = getDescription(propertyValue);
          if (
            'required' in jsonSchema.flagsSchema &&
            !jsonSchema.flagsSchema.required?.includes(propertyKey)
          ) {
            description = `${description} (optional)`.trim();
          }
          description ||= undefined;

          return [
            propertyKey,
            {
              type: cleyeType,
              description,
              multiple:
                Array.isArray(cleyeType) ||
                (propertyValue as {
                  type?: string | string[];
                }).type === 'array',
              default: propertyValue.default,
            },
          ] satisfies [string, CliFlagDefinition];
        })
      ) as Record<string, CliFlagDefinition>;

      Object.entries(flags).forEach(([fullName, flag]) => {
        const alias = params.alias?.(fullName, {
          command: commandName,
          flags,
        });
        if (alias) {
          flag.alias = alias;
        }
      });

      return {
        name: commandName,
        help: procedure._def.meta,
        parameters: jsonSchema.parameters,
        flags,
      };
    });
  };

  const buildFullCliState = async (): Promise<FullCliState> => {
    const parseProcedureInputs = await loadParseProcedureInputs();

    const procedures = Object.entries(procedureRecord).map(([name, procedure]) => {
      const procedureInputs = Array.isArray((procedure._def as { inputs?: unknown[] }).inputs)
        ? ((procedure._def as { inputs?: unknown[] }).inputs as unknown[])
        : [];
      const procedureResult = parseProcedureInputs(procedureInputs);
      if (procedureResult.success === false) {
        return [name, procedureResult.error] as [string, string];
      }

      const jsonSchema = procedureResult.value;
      const properties = flattenedProperties(jsonSchema.flagsSchema) as Record<string, JsonSchema7Type>;
      const incompatiblePairs = incompatiblePropertyPairs(jsonSchema.flagsSchema) as Array<
        [string, string]
      >;

      const trpcProcedure = procedureRecord[name];
      let type: ProcedureType;
      if (isTrpc11Procedure(trpcProcedure)) {
        type = trpcProcedure._def.type;
      } else if ((trpcProcedure._def as { mutation?: boolean }).mutation) {
        type = 'mutation';
      } else if ((trpcProcedure._def as { query?: boolean }).query) {
        type = 'query';
      } else if ((trpcProcedure._def as { subscription?: boolean }).subscription) {
        type = 'subscription';
      } else {
        const keys = Object.keys(trpcProcedure._def).join(', ');
        throw new Error(`Unknown procedure type for procedure object with keys ${keys}`);
      }

      return [
        name,
        {
          name,
          procedure,
          jsonSchema,
          properties,
          incompatiblePairs,
          type,
        },
      ] as [string, ProcedureInfo];
    });

    const procedureEntries = procedures.flatMap<[string, ProcedureInfo]>(([name, value]) =>
      typeof value === 'string' ? [] : [[name, value]]
    );

    ignoredProceduresCache = procedures.flatMap(([name, value]) =>
      typeof value === 'string' ? [{ procedure: name, reason: value }] : []
    );
    ignoredProcedures.splice(0, ignoredProcedures.length, ...ignoredProceduresCache);

    return {
      procedureEntries,
      procedureMap: Object.fromEntries(procedureEntries),
      cleyeCommands: buildCleyeCommands(procedureEntries),
    };
  };

  const getFullCliState = async (): Promise<FullCliState> => {
    return (fullCliStatePromise ??= buildFullCliState());
  };

  async function run(runParams?: {
    argv?: string[];
    logger?: Logger;
    process?: {
      stdin: NodeJS.ReadableStream;
      stdout: NodeJS.WritableStream;
      exit: (code: number) => never;
    };
  }) {
    const logger = { ...lineByLineConsoleLogger, ...runParams?.logger };
    const _process = runParams?.process || process;
    let verboseErrors: boolean = false;
    const rawArgs = runParams?.argv || process.argv.slice(2);
    const inputArgv = normalizeInputArgv(rawArgs);
    const defaultProcedure = params.default ? String(params.default.procedure) : undefined;
    const requestedCommand = resolveRequestedCommand(inputArgv, defaultProcedure);
    const shouldUseSummaryOnly =
      !inputArgv.includes('--interactive') &&
      (!requestedCommand || !summaryProcedureNames.has(requestedCommand));
    const cliState = shouldUseSummaryOnly ? undefined : await getFullCliState();
    const activeCleyeCommands = shouldUseSummaryOnly ? summaryCleyeCommands : cliState!.cleyeCommands;
    const defaultCommand =
      defaultProcedure &&
      activeCleyeCommands.find(({ name }) => name === defaultProcedure);

    const parsedArgv = cleye.cli(
      {
        flags: {
          verboseErrors: {
            type: Boolean,
            description: `Throw raw errors (by default errors are summarised)`,
            default: false,
          },
          interactive: {
            type: Boolean,
            description: `Enter interactive mode`,
            default: false,
          },
        },
        ...defaultCommand,
        commands: activeCleyeCommands
          .filter((cmd) => cmd.name !== defaultCommand?.name)
          .map((cmd) => cleye.command(cmd as any)) as cleye.Command[],
      } as any,
      undefined,
      inputArgv
    ) as ParsedCliArgv;

    verboseErrors = Boolean(
      (parsedArgv.unknownFlags as Record<string, unknown>).verboseErrors ??
        parsedArgv.flags.verboseErrors
    );

    const isInteractive = Boolean(parsedArgv.flags.interactive);
    const die: Fail = (
      message: string,
      { cause, help = true }: { cause?: unknown; help?: boolean } = {}
    ) => {
      if (verboseErrors) {
        throw (cause as Error) || new Error(message);
      }
      logger.error?.(colors.red(message));
      if (help) {
        parsedArgv.showHelp();
      }
      if (!isInteractive) {
        _process.exit(1);
      }
    };

    if (shouldUseSummaryOnly) {
      if (parsedArgv.flags.help) {
        return;
      }

      const name = JSON.stringify(requestedCommand || parsedArgv._[0]);
      const message = name ? `Command not found: ${name}.` : 'No command specified.';
      return die(message);
    }

    const fullCliState = cliState ?? (await getFullCliState());
    const caller = createTRPCProxyClient({
      links: [
        linkFactory({
          app: {
            run: (commandString) => run({ argv: argv(commandString), logger, process: _process }),
          },
          router,
        }),
      ],
    });

    if (isInteractive) {
      await runInteractive({
        runParams,
        executeCommand,
        die,
        caller,
        cleyeCommands: fullCliState.cleyeCommands,
        logger,
        verboseErrors,
        defaultCommand,
        params,
        procedureMap: fullCliState.procedureMap,
        process: _process,
      });
      return;
    }

    await executeCommand(parsedArgv, {
      caller,
      die,
      logger,
      process: _process,
      verboseErrors,
      cleyeCommands: fullCliState.cleyeCommands,
      procedureMap: fullCliState.procedureMap,
      params,
      rawArgs: inputArgv,
    });
  }
  function parseParamsString(paramsString: string): string[] {
    const params: string[] = [];
    let currentParam = '';
    let inQuotes = false;
    let quoteChar = '';
    let escape = false;
    let sawParamToken = false;
    let currentTokenQuoted = false;

    const pushCurrentParam = () => {
      params.push(currentTokenQuoted ? currentParam : currentParam.trim());
      currentParam = '';
      sawParamToken = false;
      currentTokenQuoted = false;
    };

    for (let i = 0; i < paramsString.length; i++) {
      const char = paramsString[i];

      if (escape) {
        currentParam += char;
        sawParamToken = true;
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        sawParamToken = true;
        continue;
      }

      if (inQuotes) {
        if (char === quoteChar) {
          inQuotes = false;
          sawParamToken = true;
        } else {
          currentParam += char;
          sawParamToken = true;
        }
      } else {
        if (char === '"' || char === "'") {
          if (currentParam.trim().length === 0) {
            currentParam = '';
          }
          inQuotes = true;
          quoteChar = char;
          sawParamToken = true;
          currentTokenQuoted = true;
        } else if (char === ',') {
          pushCurrentParam();
        } else {
          if (currentTokenQuoted && char.trim().length === 0) {
            continue;
          }
          currentParam += char;
          if (char.trim().length > 0) sawParamToken = true;
        }
      }
    }

    if (escape) {
      currentParam += '\\';
      sawParamToken = true;
    }

    if (sawParamToken || currentParam.trim().length > 0 || paramsString.trimEnd().endsWith(',')) {
      pushCurrentParam();
    }
    return params;
  }

  // Refactor command execution into a separate function
  async function executeCommand(
    parsedArgv: ParsedCliArgv,
    {
      caller,
      die,
      logger,
      process,
      verboseErrors,
      cleyeCommands,
      procedureMap,
      params,
      rawArgs,
    }: {
      caller: any;
      die: Fail;
      logger: Logger;
      process: {
        stdin: NodeJS.ReadableStream;
        stdout: NodeJS.WritableStream;
        exit: (code: number) => never;
      };
      verboseErrors: boolean;
      cleyeCommands: CleyeCommandOptions[];
      procedureMap: Record<string, ProcedureInfo>;
      params: Omit<TrpcCliParams<R>, 'router'>;
      rawArgs: string[];
    }
  ) {
    let { help, ...flags } = parsedArgv.flags;

    flags = Object.fromEntries(Object.entries(flags as {}).filter(([_k, v]) => v !== undefined)); // Remove undefined flags

    let command = parsedArgv.command as string | undefined;

    if (!command && parsedArgv._.length > 0) {
      command = parsedArgv._[0];
    }

    if (!command && params.default?.procedure) {
      command = String(params.default.procedure);
    }

    if (command?.includes('(')) command = command.split('(')[0];

    const procedureInfo = command && procedureMap[command];
    if (!procedureInfo) {
      const name = JSON.stringify(command || parsedArgv._[0]);
      const message = name ? `Command not found: ${name}.` : 'No command specified.';
      return die(message);
    }

    // Handle incompatible flag pairs
    const incompatibleMessages = procedureInfo.incompatiblePairs
      .filter(([a, b]) => a in flags && b in flags)
      .map(([a, b]) => `--${a} and --${b} are incompatible and cannot be used together`);

    if (incompatibleMessages?.length) {
      return die(incompatibleMessages.join('\n'));
    }

    // Manually collect multiple values for flags that accept arrays
    const flagDefinitions =
      (cleyeCommands.find((cmd) => cmd.name === procedureInfo.name)?.flags as Record<
        string,
        CliFlagDefinition
      > | undefined) ?? {};

    // Iterate over the flag definitions to handle multiple values
    for (const [flagName, flagDef] of Object.entries(flagDefinitions)) {
      if (flagDef.multiple) {
        // Collect all values for this flag
        const collectedValues = [];
        for (let i = 0; i < rawArgs.length; i++) {
          const arg = rawArgs[i];
          const longFlagWithValuePrefix = `--${flagName}=`;
          const shortFlagWithValuePrefix = flagDef.alias ? `-${flagDef.alias}=` : null;

          if (arg.startsWith(longFlagWithValuePrefix)) {
            collectedValues.push(arg.slice(longFlagWithValuePrefix.length));
            continue;
          }

          if (shortFlagWithValuePrefix && arg.startsWith(shortFlagWithValuePrefix)) {
            collectedValues.push(arg.slice(shortFlagWithValuePrefix.length));
            continue;
          }

          if (arg === `--${flagName}` || (flagDef.alias && arg === `-${flagDef.alias}`)) {
            // Collect values until the next flag or end of input
            for (let j = i + 1; j < rawArgs.length; j++) {
              const nextArg = rawArgs[j];
              if (isArrayFlagBoundary(nextArg, flagDefinitions)) {
                break; // Stop at the next declared/long flag
              }
              collectedValues.push(nextArg);
            }
          }
        }
        if (collectedValues.length > 0) {
          flags[flagName] = collectedValues;
        }
      }
    }

    const isFunc = parsedArgv._?.[0]?.includes('(');
    const fullCommand = isFunc ? parsedArgv._?.join(' ') : parsedArgv._?.[0];

    // console.log('Full command', fullCommand);
    const input = isFunc
      ? JSON.parse(fullCommand.replace(command, '').replace('(', '').replace(')', ''))
      : (procedureInfo.jsonSchema.getInput({
          _: parsedArgv._,
          flags,
        }) as never);

    try {
      const result: any = await (
        caller[procedureInfo.name][procedureInfo.type === 'query' ? 'query' : 'mutate'] as Function
      )(input);

      if (result !== undefined) logger.info?.(result);
      if (result?.message) console.log(result.message);

      const isInteractive = parsedArgv.flags.interactive;
      if (!isInteractive) {
        process.exit(0);
      }
    } catch (err) {
      throw transformError(err, die);
    }
  }

  // Implement the interactive loop
  async function runInteractive({
    runParams,
    executeCommand,
    die,
    caller,
    cleyeCommands,
    logger,
    verboseErrors,
    defaultCommand,
    params,
    procedureMap,
    process,
  }: {
    runParams: any;
    executeCommand: Function;
    die: Fail;
    caller: any;
    cleyeCommands: CleyeCommandOptions[];
    logger: Logger;
    verboseErrors: boolean;
    defaultCommand: CleyeCommandOptions | undefined;
    params: Omit<TrpcCliParams<R>, 'router'>;
    procedureMap: Record<string, ProcedureInfo>;
    process: {
      stdin: NodeJS.ReadableStream;
      stdout: NodeJS.WritableStream;
      exit: (code: number) => never;
    };
  }) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
      const inputArgv = normalizeInputArgv(argv(line));

      if (inputArgv.length === 0 || !inputArgv[0]) {
        rl.prompt();
        return;
      }

      const parsedArgv = cleye.cli(
        {
          flags: {
            verboseErrors: {
              type: Boolean,
              description: `Throw raw errors (by default errors are summarised)`,
              default: false,
            },
          },
          ...defaultCommand,
          commands: cleyeCommands
            .filter((cmd) => cmd.name !== defaultCommand?.name)
            .map((cmd) => cleye.command(cmd as any)) as cleye.Command[],
        } as any,
        undefined,
        inputArgv
      ) as ParsedCliArgv;

      parsedArgv.flags.interactive = true;

      try {
        await executeCommand(parsedArgv, {
          caller,
          die,
          logger,
          process,
          verboseErrors,
          cleyeCommands,
          procedureMap,
          params,
          rawArgs: inputArgv,
        });
      } catch (err) {
        die(err instanceof Error ? err.message : String(err), { cause: err, help: false });
      }

      rl.prompt();
    }).on('close', () => {
      process.exit(0);
    });
  }

  return {
    run,
    executeCommand,
    get ignoredProcedures() {
      return getIgnoredProcedures();
    },
  };
}

function parseParamsString(paramsString: string): string[] {
  const params: string[] = [];
  let currentParam = '';
  let inQuotes = false;
  let quoteChar = '';
  let escape = false;
  let sawParamToken = false;
  let currentTokenQuoted = false;

  const pushCurrentParam = () => {
    params.push(currentTokenQuoted ? currentParam : currentParam.trim());
    currentParam = '';
    sawParamToken = false;
    currentTokenQuoted = false;
  };

  for (let i = 0; i < paramsString.length; i++) {
    const char = paramsString[i];

    if (escape) {
      currentParam += char;
      sawParamToken = true;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      sawParamToken = true;
      continue;
    }

    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
        sawParamToken = true;
      } else {
        currentParam += char;
        sawParamToken = true;
      }
    } else {
      if (char === '"' || char === "'") {
        if (currentParam.trim().length === 0) {
          currentParam = '';
        }
        inQuotes = true;
        quoteChar = char;
        sawParamToken = true;
        currentTokenQuoted = true;
      } else if (char === ',') {
        pushCurrentParam();
      } else {
        if (currentTokenQuoted && char.trim().length === 0) {
          continue;
        }
        currentParam += char;
        if (char.trim().length > 0) sawParamToken = true;
      }
    }
  }

  if (escape) {
    currentParam += '\\';
    sawParamToken = true;
  }

  if (sawParamToken || currentParam.trim().length > 0 || paramsString.trimEnd().endsWith(',')) {
    pushCurrentParam();
  }
  return params;
}

function normalizeInputArgv(rawArgs: string[]): string[] {
  let inputArgv = rawArgs.slice();
  const commandName = inputArgv[0];
  const shorthandIndex = inputArgv[0] === commandName ? 1 : 0;
  const shorthandResult = reconstructShorthandCommand(inputArgv.slice(shorthandIndex));

  if (!shorthandResult) {
    return inputArgv;
  }

  const { shorthandCommand, remainingArgs } = shorthandResult;
  const shorthandRegex = /^([\w-]+)\.([\w-]+)\((.*)\)$/s;
  const match = shorthandCommand.match(shorthandRegex);
  if (!match) {
    return inputArgv;
  }

  const [, agent, method, paramsString] = match;
  const params = parseParamsString(paramsString);
  return [
    commandName,
    '--agent',
    agent,
    '--method',
    method,
    ...(params.length > 0 ? ['--params', ...params] : []),
    ...remainingArgs,
  ];
}

function resolveRequestedCommand(inputArgv: string[], defaultProcedure?: string): string | undefined {
  for (const token of inputArgv) {
    if (token === '--') break;
    if (
      token === '--help' ||
      token === '-h' ||
      token === '--verboseErrors' ||
      token === '--interactive'
    ) {
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    return token.includes('(') ? token.split('(')[0] : token;
  }

  return defaultProcedure;
}

function reconstructShorthandCommand(
  argv: string[]
): { shorthandCommand: string; remainingArgs: string[] } | null {
  let shorthandCommandParts = [];
  let startIndex = -1;
  let parenDepth = 0;
  let found = false;

  // Find the start of the shorthand command
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (arg.includes('.') && arg.includes('(')) {
        startIndex = i;
        break;
      }
    }
  }

  if (startIndex === -1) {
    // No shorthand command found
    return null;
  }

  // Reconstruct the shorthand command
  for (let i = startIndex; i < argv.length; i++) {
    const arg = argv[i];
    shorthandCommandParts.push(arg);

    for (const char of arg) {
      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
        if (parenDepth === 0) {
          found = true;
          break;
        }
      }
    }
    if (found) {
      const remainingArgs = argv.slice(i + 1);
      const shorthandCommand = shorthandCommandParts.join(' ');
      return { shorthandCommand, remainingArgs };
    }
  }

  // If we reach here, the shorthand command wasn't properly closed
  return null;
}

type Fail = (message: string, options?: { cause?: unknown; help?: boolean }) => void;

function isFlagToken(value: string): boolean {
  if (!value.startsWith('-')) return false;
  if (value === '-') return false;
  if (value.startsWith('--')) return true;

  // Keep numeric literals (e.g. -1, -0.5, -1e3) as positional values for array inputs.
  return Number.isNaN(Number(value));
}

function isArrayFlagBoundary(
  value: string,
  flagDefinitions: Record<string, CliFlagDefinition>
): boolean {
  if (!isFlagToken(value)) return false;
  if (value.startsWith('--')) return true;

  return Object.values(flagDefinitions).some((flagDef) => {
    if (!flagDef.alias) return false;
    return value === `-${flagDef.alias}` || value.startsWith(`-${flagDef.alias}=`);
  }) || isFlagToken(value);
}

function transformError(err: unknown, fail: Fail): unknown {
  if (looksLikeInstanceof(err, Error) && err.message.includes('This is a client-only function')) {
    return new Error(
      'createCallerFactory version mismatch - pass in createCallerFactory explicitly',
      { cause: err }
    );
  }
  if (looksLikeInstanceof(err, trpcServer.TRPCError)) {
    const cause = err.cause;
    if (looksLikeInstanceof(cause, ZodError)) {
      const originalIssues = cause.issues;
      try {
        cause.issues = cause.issues.map((issue) => {
          if (typeof issue.path[0] !== 'string') return issue;
          return {
            ...issue,
            path: ['--' + issue.path[0], ...issue.path.slice(1)],
          };
        });

        const prettyError = zodValidationError.fromError(cause, {
          prefixSeparator: '\n  - ',
          issueSeparator: '\n  - ',
        });

        return fail(prettyError.message, { cause, help: true });
      } finally {
        cause.issues = originalIssues;
      }
    }
    if (err.code === 'INTERNAL_SERVER_ERROR') {
      throw cause;
    }
    if (err.code === 'BAD_REQUEST') {
      return fail(err.message, { cause: err });
    }
  }
  if (looksLikeInstanceof(err, TRPCClientError)) {
    const message = err.message;
    try {
      const parsed = JSON.parse(message) as Array<{ message?: string; path?: Array<string | number> }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const pretty = parsed
          .map((issue) => {
            const hasPath = Array.isArray(issue.path) && issue.path.length > 0;
            return hasPath ? `${issue.message ?? 'Invalid input'} at index ${issue.path![0]}` : issue.message ?? 'Invalid input';
          })
          .join('\n  - ');
        return fail(`Validation error\n  - ${pretty}`, { cause: err, help: true });
      }
    } catch {
      // non-JSON error messages
    }
  }
  return err;
}

type CleyeCommandOptions = {
  name: string;
  help?: unknown;
  parameters?: string[];
  flags?: Record<string, CliFlagDefinition>;
};
type CliFlagDefinition = {
  type: unknown;
  description?: string;
  placeholder?: string;
  alias?: string;
  multiple?: boolean;
  default?: unknown;
};

function getCleyeType(schema: JsonSchema7Type): CliFlagDefinition['type'] {
  const _type = 'type' in schema && typeof schema.type === 'string' ? schema.type : null;

  switch (_type) {
    case 'string': {
      return String;
    }
    case 'integer':
    case 'number': {
      return Number;
    }
    case 'boolean': {
      return Boolean;
    }
    case 'array': {
      // Determine the item type
      // if (
      //   "items" in schema &&
      //   schema.items &&
      //   typeof schema.items === "object"
      // ) {
      //   const itemType = getCleyeType(schema.items as JsonSchema7Type);
      //   return [itemType];
      // }
      return [String]; // Default to [String] if item type is not specified
    }
    case 'object': {
      return (s: string) => JSON.parse(s) as {};
    }
    default: {
      _type satisfies 'null' | null; // Ensure exhaustive checking
      return (value: unknown) => value;
    }
  }
}
