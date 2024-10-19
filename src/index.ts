/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as trpcServer from "@trpc/server";
import * as cleye from "cleye";
import colors from "picocolors";
import { ZodError } from "zod";
import { type JsonSchema7Type } from "zod-to-json-schema";
import * as zodValidationError from "zod-validation-error";
import argv from "string-argv";
import { createTRPCProxyClient } from "@trpc/client";
import {
  flattenedProperties,
  incompatiblePropertyPairs,
  getDescription,
} from "./json-schema";
import { lineByLineConsoleLogger } from "./logging";
import { AnyProcedure, AnyRouter, isTrpc11Procedure } from "./trpc-compat";
import { Logger, TrpcCliParams } from "./types";
import { looksLikeInstanceof } from "./util";
import { parseProcedureInputs } from "./zod-procedure";

export * from "./types";

export { z } from "zod";
export * as zod from "zod";

export * as trpcServer from "@trpc/server";

/** Re-export of the @trpc/server package to avoid needing to install manually when getting started */

export type { AnyRouter, AnyProcedure } from "./trpc-compat";

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
  const procedures = Object.entries<AnyProcedure>(
    router._def.procedures as {}
  ).map(([name, procedure]) => {
    const procedureResult = parseProcedureInputs(
      // @ts-ignore
      procedure._def.inputs as unknown[]
    );
    if (!procedureResult.success) {
      // @ts-ignore
      return [name, procedureResult.error] as const;
    }

    const jsonSchema = procedureResult.value;
    const properties = flattenedProperties(jsonSchema.flagsSchema);
    const incompatiblePairs = incompatiblePropertyPairs(jsonSchema.flagsSchema);

    // TRPC types are a bit of a lie - they claim to be `router._def.procedures.foo.bar` but really they're `router._def.procedures['foo.bar']`
    const trpcProcedure = router._def.procedures[name] as AnyProcedure;
    let type: "mutation" | "query" | "subscription";
    if (isTrpc11Procedure(trpcProcedure)) {
      type = trpcProcedure._def.type;
      // @ts-ignore
    } else if (trpcProcedure._def.mutation) {
      type = "mutation";
      // @ts-ignore
    } else if (trpcProcedure._def.query) {
      type = "query";
      // @ts-ignore
    } else if (trpcProcedure._def.subscription) {
      type = "subscription";
    } else {
      const keys = Object.keys(trpcProcedure._def).join(", ");
      throw new Error(
        `Unknown procedure type for procedure object with keys ${keys}`
      );
    }

    return [
      name,
      { name, procedure, jsonSchema, properties, incompatiblePairs, type },
    ] as const;
  });

  const procedureEntries = procedures.flatMap(([k, v]) => {
    return typeof v === "string" ? [] : [[k, v] as const];
  });

  const procedureMap = Object.fromEntries(procedureEntries);

  const ignoredProcedures = procedures.flatMap(([k, v]) =>
    typeof v === "string" ? [{ procedure: k, reason: v }] : []
  );

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

    const cleyeCommands = procedureEntries.map(
      ([
        commandName,
        { procedure, jsonSchema, properties },
      ]): CleyeCommandOptions => {
        const flags = Object.fromEntries(
          Object.entries(properties).map(([propertyKey, propertyValue]) => {
            const cleyeType = getCleyeType(propertyValue);

            let description: string | undefined = getDescription(propertyValue);
            if (
              "required" in jsonSchema.flagsSchema &&
              !jsonSchema.flagsSchema.required?.includes(propertyKey)
            ) {
              description = `${description} (optional)`.trim();
            }
            description ||= undefined;

            // Determine if the flag should accept multiple values
            const isMultiple =
              Array.isArray(cleyeType) || propertyValue.type === "array";

            return [
              propertyKey,
              {
                type: cleyeType,
                description,
                multiple: isMultiple, // Set 'multiple' to true for array types
                // @ts-ignore
                default: propertyValue.default as {},
              },
            ];
          })
        );

        Object.entries(flags).forEach(([fullName, flag]) => {
          const alias = params.alias?.(fullName, {
            command: commandName,
            flags,
          });
          if (alias) {
            Object.assign(flag, { alias: alias });
          }
        });

        return {
          name: commandName,
          help: procedure._def.meta,
          parameters: jsonSchema.parameters,
          flags: flags as {},
        };
      }
    );

    const defaultCommand =
      params.default &&
      cleyeCommands.find(({ name }) => name === params.default?.procedure);

    const rawArgs = runParams?.argv || process.argv.slice(2);

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
        commands: cleyeCommands
          .filter((cmd) => cmd.name !== defaultCommand?.name)
          .map((cmd) => cleye.command(cmd)) as cleye.Command[],
      },
      undefined,
      rawArgs
    );

    const { verboseErrors: _verboseErrors, ...unknownFlags } =
      parsedArgv.unknownFlags as Record<string, unknown>;
    verboseErrors = _verboseErrors || parsedArgv.flags.verboseErrors;

    type Context = NonNullable<typeof params.context>;

    const caller = createTRPCProxyClient<R>({
      links: [link],
    });
    // console.log("argv", parsedArgv);
    // Adjust the die function to handle interactive mode
    const isInteractive =
      parsedArgv.flags.interactive ||
      parsedArgv._.length === 0 ||
      !parsedArgv.command;
    // console.log("vvv", isInteractive);
    const die: Fail = (
      message: string,
      { cause, help = true }: { cause?: unknown; help?: boolean } = {}
    ) => {
      if (verboseErrors !== undefined && verboseErrors) {
        console.log("throwing error");
        throw (cause as Error) || new Error(message);
      }
      logger.error?.(colors.red(message));
      if (help) {
        parsedArgv.showHelp();
      }
      if (!isInteractive) {
        console.log("exiting");
        _process.exit(1);
      }
    };

    // Handle interactive mode
    if (isInteractive) {
      await runInteractive({
        runParams,
        procedures: procedureMap,
        executeCommand,
        die,
        caller,
        cleyeCommands,
        logger,
        verboseErrors,
        defaultCommand,
        params,
        process: _process,
      });
      return;
    }

    // Execute the command
    await executeCommand(parsedArgv, {
      caller,
      die,
      logger,
      process: _process,
      verboseErrors,
      cleyeCommands,
      params,
    });
  }

  // Refactor command execution into a separate function
  async function executeCommand(
    parsedArgv: ReturnType<typeof cleye.cli>,
    {
      caller,
      die,
      logger,
      process,
      verboseErrors,
      cleyeCommands,
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
      params: TrpcCliParams<R>;
      rawArgs: string[]; // Add rawArgs to the parameter list
    }
  ) {
    let { help, ...flags } = parsedArgv.flags;

    flags = Object.fromEntries(
      Object.entries(flags as {}).filter(([_k, v]) => v !== undefined)
    ); // Remove undefined flags

    let command = parsedArgv.command as string | undefined;

    if (!command && parsedArgv._.length > 0) {
      command = parsedArgv._[0];
    }

    const procedureInfo = command && procedureMap[command];
    if (!procedureInfo) {
      const name = JSON.stringify(command || parsedArgv._[0]);
      const message = name
        ? `Command not found: ${name}.`
        : "No command specified.";
      return die(message);
    }

    // Handle incompatible flag pairs
    const incompatibleMessages = procedureInfo.incompatiblePairs
      .filter(([a, b]) => a in flags && b in flags)
      .map(
        ([a, b]) =>
          `--${a} and --${b} are incompatible and cannot be used together`
      );

    if (incompatibleMessages?.length) {
      return die(incompatibleMessages.join("\n"));
    }

    // Manually collect multiple values for flags that accept arrays
    const flagDefinitions = cleyeCommands.find(
      (cmd) => cmd.name === procedureInfo.name
    )?.flags as Record<string, CleyeFlag>;

    // Iterate over the flag definitions to handle multiple values
    for (const [flagName, flagDef] of Object.entries(flagDefinitions)) {
      if (flagDef.multiple) {
        // Collect all values for this flag
        const collectedValues = [];
        for (let i = 0; i < rawArgs.length; i++) {
          const arg = rawArgs[i];
          if (
            arg === `--${flagName}` ||
            (flagDef.alias && arg === `-${flagDef.alias}`)
          ) {
            // Collect values until the next flag or end of input
            for (let j = i + 1; j < rawArgs.length; j++) {
              const nextArg = rawArgs[j];
              if (nextArg.startsWith("--") || nextArg.startsWith("-")) {
                break; // Stop at the next flag
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

    const input = procedureInfo.jsonSchema.getInput({
      _: parsedArgv._,
      flags,
    }) as never;

    try {
      const result: unknown = await (
        caller[procedureInfo.name][
          procedureInfo.type === "query" ? "query" : "mutate"
        ] as Function
      )(input);
      if (result) logger.info?.(result);
      const isInteractive =
        parsedArgv.flags.interactive ||
        parsedArgv._.length === 0 ||
        !parsedArgv.command;
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
    procedures,
    executeCommand,
    die,
    caller,
    cleyeCommands,
    logger,
    verboseErrors,
    defaultCommand,
    params,
    process,
  }: {
    runParams: any;
    procedures: Record<string, any>;
    executeCommand: Function;
    die: Fail;
    caller: any;
    cleyeCommands: CleyeCommandOptions[];
    logger: Logger;
    verboseErrors: boolean;
    defaultCommand: CleyeCommandOptions | undefined;
    params: TrpcCliParams<R>;
    process: {
      stdin: NodeJS.ReadableStream;
      stdout: NodeJS.WritableStream;
      exit: (code: number) => never;
    };
  }) {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "> ",
    });

    rl.prompt();

    rl.on("line", async (line: string) => {
      const inputArgv = argv(line);

      if (inputArgv.length === 0 || !inputArgv[0]) {
        rl.prompt();
        return;
      }

      // Parse the input arguments
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
            .map((cmd) => cleye.command(cmd)) as cleye.Command[],
        },
        undefined,
        inputArgv
      );

      // console.log(parsedArgv);

      parsedArgv.flags.interactive = true;

      try {
        await executeCommand(parsedArgv, {
          caller,
          die,
          logger,
          process,
          verboseErrors,
          cleyeCommands,
          params,
          rawArgs: inputArgv, // Pass inputArgv as rawArgs
        });
      } catch (err) {
        // Handle errors in interactive mode
        die(err.message, { cause: err, help: false });
      }

      rl.prompt();
    }).on("close", () => {
      process.exit(0);
    });
  }

  return { run, ignoredProcedures };
}

type Fail = (
  message: string,
  options?: { cause?: unknown; help?: boolean }
) => void;

function transformError(err: unknown, fail: Fail): unknown {
  if (
    looksLikeInstanceof(err, Error) &&
    err.message.includes("This is a client-only function")
  ) {
    return new Error(
      "createCallerFactory version mismatch - pass in createCallerFactory explicitly",
      { cause: err }
    );
  }
  if (looksLikeInstanceof(err, trpcServer.TRPCError)) {
    const cause = err.cause;
    if (looksLikeInstanceof(cause, ZodError)) {
      const originalIssues = cause.issues;
      try {
        cause.issues = cause.issues.map((issue) => {
          if (typeof issue.path[0] !== "string") return issue;
          return {
            ...issue,
            path: ["--" + issue.path[0], ...issue.path.slice(1)],
          };
        });

        const prettyError = zodValidationError.fromError(cause, {
          prefixSeparator: "\n  - ",
          issueSeparator: "\n  - ",
        });

        return fail(prettyError.message, { cause, help: true });
      } finally {
        cause.issues = originalIssues;
      }
    }
    if (err.code === "INTERNAL_SERVER_ERROR") {
      throw cause;
    }
    if (err.code === "BAD_REQUEST") {
      return fail(err.message, { cause: err });
    }
  }
  return err;
}

type CleyeCommandOptions = cleye.Command["options"];
type CleyeFlag = NonNullable<CleyeCommandOptions["flags"]>[string];

function getCleyeType(
  schema: JsonSchema7Type
): Extract<CleyeFlag, { type: unknown }>["type"] {
  const _type =
    "type" in schema && typeof schema.type === "string" ? schema.type : null;

  switch (_type) {
    case "string": {
      return String;
    }
    case "integer":
    case "number": {
      return Number;
    }
    case "boolean": {
      return Boolean;
    }
    case "array": {
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
    case "object": {
      return (s: string) => JSON.parse(s) as {};
    }
    default: {
      _type satisfies "null" | null; // Ensure exhaustive checking
      return (value: unknown) => value;
    }
  }
}
