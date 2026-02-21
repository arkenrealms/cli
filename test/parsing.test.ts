import { initTRPC, type Router } from "@trpc/server";
import stripAnsi from "strip-ansi";
import { expect, test } from "vitest";
import { z } from "zod";
import { createCli, type TrpcCliMeta, type TrpcCliParams } from "../src";
import { link } from "../src/router";

expect.addSnapshotSerializer({
  test: (val): val is Error => val instanceof Error,
  print: (val) => {
    let err = val as Error;
    const messages = [err.message];
    while (err.cause instanceof Error) {
      err = err.cause;
      messages.push("  ".repeat(messages.length) + "Caused by: " + err.message);
    }
    return stripAnsi(messages.join("\n"));
  },
});

const t = initTRPC.meta<TrpcCliMeta>().create();

const run = <R extends Router<any>>(router: R, argv: string[]) => {
  return runWith({ router, link }, argv);
};

const runWith = <R extends Router<any>>(
  params: TrpcCliParams<R>,
  argv: string[]
) => {
  const cli = createCli(params);
  return new Promise<string>((resolve, reject) => {
    const logs: unknown[][] = [];
    const addLogs = (...args: unknown[]) => logs.push(args);
    void cli
      .run({
        argv,
        logger: { info: addLogs, error: addLogs },
        process: {
          exit: (code) => {
            if (code === 0) {
              resolve(logs.join("\n"));
            } else {
              reject(
                new Error(`CLI exited with code ${code}`, {
                  cause: new Error("Logs: " + logs.join("\n")),
                })
              );
            }
            return code as never;
          },
        },
      })
      .catch(reject);
  });
};

test("merging input types", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.object({ bar: z.string() }))
      .input(z.object({ baz: z.number() }))
      .input(z.object({ qux: z.boolean() }))
      .query(({ input }) => Object.entries(input).join(", ")),
  });

  expect(
    await run(router, ["foo", "--bar", "hello", "--baz", "42", "--qux"])
  ).toMatchInlineSnapshot(`"bar,hello, baz,42, qux,true"`);
});

test("string input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.string())
      .query(({ input }) => JSON.stringify(input)),
  });

  expect(await run(router, ["foo", "hello"])).toMatchInlineSnapshot(
    `""hello""`
  );
});

test("enum input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.enum(["aa", "bb"]))
      .query(({ input }) => JSON.stringify(input)),
  });

  expect(await run(router, ["foo", "aa"])).toMatchInlineSnapshot(`""aa""`);
  await expect(run(router, ["foo", "cc"])).rejects.toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Invalid enum value. Expected 'aa' | 'bb', received 'cc'
  `);
});

test("number input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.number())
      .query(({ input }) => JSON.stringify(input)),
  });

  expect(await run(router, ["foo", "1"])).toMatchInlineSnapshot(`"1"`);
  await expect(run(router, ["foo", "a"])).rejects.toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Expected number, received string
  `);
});

test("boolean input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.boolean())
      .query(({ input }) => JSON.stringify(input)),
  });

  expect(await run(router, ["foo", "true"])).toMatchInlineSnapshot(`"true"`);
  expect(await run(router, ["foo", "false"])).toMatchInlineSnapshot(`"false"`);
  await expect(run(router, ["foo", "a"])).rejects.toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Expected boolean, received string
  `);
});

test("refine in a union", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.union([z.number().int(), z.string()]))
      .query(({ input }) => JSON.stringify(input)),
  });

  expect(await run(router, ["foo", "11"])).toBe(JSON.stringify(11));
  expect(await run(router, ["foo", "aa"])).toBe(JSON.stringify("aa"));
  expect(await run(router, ["foo", "1.1"])).toBe(JSON.stringify("1.1"));
});

test("transform in a union", async () => {
  const router = t.router({
    foo: t.procedure
      .input(
        z.union([
          z
            .number()
            .int()
            .transform((n) => `Roman numeral: ${"I".repeat(n)}`),
          z.string(),
        ])
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  expect(await run(router, ["foo", "3"])).toMatchInlineSnapshot(
    `""Roman numeral: III""`
  );
  expect(await run(router, ["foo", "a"])).toMatchInlineSnapshot(`""a""`);
  expect(await run(router, ["foo", "3.3"])).toMatchInlineSnapshot(`""3.3""`);
});

test("literal input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.literal(2))
      .query(({ input }) => JSON.stringify(input)),
  });

  expect(await run(router, ["foo", "2"])).toMatchInlineSnapshot(`"2"`);
  await expect(run(router, ["foo", "3"])).rejects.toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Invalid literal value, expected 2
  `);
});

test("optional input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.string().optional())
      .query(({ input }) => JSON.stringify(input || null)),
  });

  expect(await run(router, ["foo", "a"])).toMatchInlineSnapshot(`""a""`);
  expect(await run(router, ["foo"])).toMatchInlineSnapshot(`"null"`);
});

test("union input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.union([z.number(), z.string()]))
      .query(({ input }) => JSON.stringify(input || null)),
  });

  expect(await run(router, ["foo", "a"])).toMatchInlineSnapshot(`""a""`);
  expect(await run(router, ["foo", "1"])).toMatchInlineSnapshot(`"1"`);
});

test("regex input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.string().regex(/hello/).describe("greeting"))
      .query(({ input }) => JSON.stringify(input || null)),
  });

  expect(await run(router, ["foo", "hello abc"])).toMatchInlineSnapshot(
    `""hello abc""`
  );
  await expect(run(router, ["foo", "goodbye xyz"])).rejects
    .toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Invalid
  `);
});

test("boolean, number, string input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.union([z.string(), z.number(), z.boolean()]))
      .query(({ input }) => JSON.stringify(input || null)),
  });

  expect(await run(router, ["foo", "true"])).toMatchInlineSnapshot(`"true"`);
  expect(await run(router, ["foo", "1"])).toMatchInlineSnapshot(`"1"`);
  expect(await run(router, ["foo", "a"])).toMatchInlineSnapshot(`""a""`);
});

test("tuple input", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.tuple([z.string(), z.number()]))
      .query(({ input }) => JSON.stringify(input || null)),
  });

  expect(await run(router, ["foo", "hello", "123"])).toMatchInlineSnapshot(
    `"["hello",123]"`
  );
  await expect(run(router, ["foo", "hello", "not a number!"])).rejects
    .toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Expected number, received string at index 1
  `);
});

test("tuple input with flags", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.tuple([z.string(), z.number(), z.object({ foo: z.string() })]))
      .query(({ input }) => JSON.stringify(input || null)),
  });

  expect(
    await run(router, ["foo", "hello", "123", "--foo", "bar"])
  ).toMatchInlineSnapshot(`"["hello",123,{"foo":"bar"}]"`);
  await expect(run(router, ["foo", "hello", "123"])).rejects
    .toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Required at index 2
  `);
  await expect(run(router, ["foo", "hello", "not a number!", "--foo", "bar"]))
    .rejects.toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Expected number, received string at index 1
  `);
  await expect(run(router, ["foo", "hello", "not a number!"])).rejects
    .toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Expected number, received string at index 1
      - Required at index 2
  `);
});

test("single character flag", async () => {
  const router = t.router({
    foo: t.procedure
      .input(z.object({ a: z.string() }))
      .query(({ input }) => JSON.stringify(input || null)),
  });

  // This test will fail because single-character flags are typically reserved for aliases (e.g., -a)
  await expect(
    run(router, ["foo", "hello", "123", "--a", "b"])
  ).rejects.toMatchInlineSnapshot(
    `Flag name "a" must be longer than a character`
  );
});

test("custom default procedure", async () => {
  const yarn = t.router({
    install: t.procedure
      .input(z.object({ frozenLockfile: z.boolean().optional() }))
      .query(({ input }) => "install: " + JSON.stringify(input)),
  });

  const params: TrpcCliParams<typeof yarn> = {
    router: yarn,
    default: { procedure: "install" },
  };

  const yarnOutput = await runWith(params, ["--frozen-lockfile"]);
  expect(yarnOutput).toMatchInlineSnapshot(
    `"install: {"frozenLockfile":true}"`
  );

  const yarnInstallOutput = await runWith(params, [
    "install",
    "--frozen-lockfile",
  ]);
  expect(yarnInstallOutput).toMatchInlineSnapshot(
    `"install: {"frozenLockfile":true}"`
  );
});

test("validation", () => {
  const router = t.router({
    tupleOfStrings: t.procedure
      .input(
        z.tuple([
          z.string().describe("The first string"),
          z.string().describe("The second string"),
        ])
      )
      .query(() => "ok"),
    tupleWithBoolean: t.procedure
      .input(z.tuple([z.string(), z.boolean()]))
      .query(() => "ok"),
    tupleWithBooleanThenObject: t.procedure
      .input(z.tuple([z.string(), z.boolean(), z.object({ foo: z.string() })]))
      .query(() => "ok"),
    tupleWithObjectInTheMiddle: t.procedure
      .input(z.tuple([z.string(), z.object({ foo: z.string() }), z.string()]))
      .query(() => "ok"),
    tupleWithRecord: t.procedure
      .input(z.tuple([z.string(), z.record(z.string())]))
      .query(() => "ok"),
  });
  const cli = createCli({ router });

  expect(cli.ignoredProcedures).toMatchInlineSnapshot(`
    [
      {
        "procedure": "tupleWithObjectInTheMiddle",
        "reason": "Invalid input type [ZodString, ZodObject, ZodString]. Positional parameters must be strings, numbers or booleans.",
      },
      {
        "procedure": "tupleWithRecord",
        "reason": "Invalid input type [ZodString, ZodRecord]. The last type must accept object inputs.",
      },
    ]
  `);
});

test("string array input", async () => {
  const router = t.router({
    stringArray: t.procedure
      .input(z.array(z.string()))
      .query(({ input }) => `strings: ${JSON.stringify(input)}`),
  });

  const cli = createCli({ router });

  expect(cli.ignoredProcedures).toEqual([]);

  const result = await run(router, ["stringArray", "hello", "world"]);
  expect(result).toMatchInlineSnapshot(`"strings: ["hello","world"]"`);
});

test("number array input", async () => {
  const router = t.router({
    test: t.procedure
      .input(z.array(z.number()))
      .query(({ input }) => `list: ${JSON.stringify(input)}`),
  });

  const cli = createCli({ router });

  expect(cli.ignoredProcedures).toEqual([]);

  const result = await run(router, ["test", "1", "2", "3", "4"]);
  expect(result).toMatchInlineSnapshot(`"list: [1,2,3,4]"`);

  await expect(run(router, ["test", "1", "bad"])).rejects
    .toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Expected number, received string at index 1
  `);
});

test("number array input with constraints", async () => {
  const router = t.router({
    test: t.procedure
      .input(z.array(z.number().int()))
      .query(({ input }) => `list: ${JSON.stringify(input)}`),
  });

  await expect(run(router, ["test", "1.2"])).rejects.toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Expected integer, received float at index 0
  `);
});

test("array flag accepts hyphen-prefixed values", async () => {
  const router = t.router({
    test: t.procedure
      .input(
        z.object({
          values: z.array(z.string()),
          tag: z.string().optional(),
        })
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  const result = await run(router, [
    "test",
    "--values",
    "-1",
    "-2",
    "3",
    "--tag",
    "demo",
  ]);

  expect(result).toMatchInlineSnapshot(
    `"{\"values\":[\"-1\",\"-2\",\"3\"],\"tag\":\"demo\"}"`
  );
});

test("array flag accepts single hyphen value", async () => {
  const router = t.router({
    test: t.procedure
      .input(
        z.object({
          values: z.array(z.string()),
          tag: z.string().optional(),
        })
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  const result = await run(router, [
    "test",
    "--values",
    "-",
    "literal",
    "--tag",
    "demo",
  ]);

  expect(result).toMatchInlineSnapshot(
    `"{\"values\":[\"-\",\"literal\"],\"tag\":\"demo\"}"`
  );
});

test("array flag accepts short-alias equals values", async () => {
  const router = t.router({
    test: t.procedure
      .input(
        z.object({
          values: z.array(z.string()),
          tag: z.string().optional(),
        })
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  const result = await runWith(
    {
      router,
      link,
      alias: (flagName) => (flagName === "values" ? "v" : undefined),
    },
    ["test", "-v=alpha", "-v=beta", "--tag", "demo"]
  );

  expect(result).toMatchInlineSnapshot(
    `"{\"values\":[\"alpha\",\"beta\"],\"tag\":\"demo\"}"`
  );
});

test("array flag accepts repeated short-alias spaced values", async () => {
  const router = t.router({
    test: t.procedure
      .input(
        z.object({
          values: z.array(z.string()),
          tag: z.string().optional(),
        })
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  const result = await runWith(
    {
      router,
      link,
      alias: (flagName) => (flagName === "values" ? "v" : undefined),
    },
    ["test", "-v", "alpha", "-v", "beta", "--tag", "demo"]
  );

  expect(result).toMatchInlineSnapshot(
    `"{\"values\":[\"alpha\",\"beta\"],\"tag\":\"demo\"}"`
  );
});

test("array flag does not absorb unknown short flags", async () => {
  const router = t.router({
    test: t.procedure
      .input(
        z.object({
          values: z.array(z.string()),
        })
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  const result = await run(router, ["test", "--values", "alpha", "-x"]);

  expect(result).toMatchInlineSnapshot(`"{\"values\":[\"alpha\"]}"`);
});

test("array flag accepts equals-assigned values", async () => {
  const router = t.router({
    test: t.procedure
      .input(
        z.object({
          values: z.array(z.string()),
          tag: z.string().optional(),
        })
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  const result = await run(router, [
    "test",
    "--values=alpha",
    "--values=beta",
    "--tag",
    "demo",
  ]);

  expect(result).toMatchInlineSnapshot(
    `"{\"values\":[\"alpha\",\"beta\"],\"tag\":\"demo\"}"`
  );
});

test("shorthand parser preserves trailing empty params", async () => {
  const router = t.router({
    "cerebro.exec": t.procedure
      .input(
        z.object({
          agent: z.string(),
          method: z.string(),
          params: z.array(z.string()),
        })
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  const result = await run(router, ["cerebro.exec", 'Gon.ask("hello", "")']);

  expect(result).toMatchInlineSnapshot(
    `"{\"agent\":\"Gon\",\"method\":\"ask\",\"params\":[\"hello\",\"\"]}"`
  );
});

test("shorthand parser preserves quoted whitespace params", async () => {
  const router = t.router({
    "cerebro.exec": t.procedure
      .input(
        z.object({
          agent: z.string(),
          method: z.string(),
          params: z.array(z.string()),
        })
      )
      .query(({ input }) => JSON.stringify(input)),
  });

  const result = await run(router, ["cerebro.exec", 'Gon.ask("hello", "   ")']);

  expect(result).toMatchInlineSnapshot(
    `"{\"agent\":\"Gon\",\"method\":\"ask\",\"params\":[\"hello\",\"   \"]}"`
  );
});

test("boolean array input", async () => {
  const router = t.router({
    test: t.procedure
      .input(z.array(z.boolean()))
      .query(({ input }) => `list: ${JSON.stringify(input)}`),
  });

  const cli = createCli({ router });

  expect(cli.ignoredProcedures).toEqual([]);

  const result = await run(router, ["test", "true", "false", "true"]);
  expect(result).toMatchInlineSnapshot(`"list: [true,false,true]"`);

  await expect(run(router, ["test", "true", "bad"])).rejects
    .toMatchInlineSnapshot(`
    CLI exited with code 1
      Caused by: Logs: Validation error
      - Expected boolean, received string at index 1
  `);
});

test("mixed array input", async () => {
  const router = t.router({
    test: t.procedure
      .input(z.array(z.union([z.boolean(), z.number(), z.string()])))
      .query(({ input }) => `list: ${JSON.stringify(input)}`),
  });

  const cli = createCli({ router });

  expect(cli.ignoredProcedures).toEqual([]);

  const result = await run(router, [
    "test",
    "12",
    "true",
    "3.14",
    "null",
    "undefined",
    "hello",
  ]);
  expect(result).toMatchInlineSnapshot(
    `"list: [12,true,3.14,"null","undefined","hello"]"`
  );
});

test("nullable array inputs aren't supported", () => {
  const router = t.router({
    test1: t.procedure
      .input(z.array(z.string().nullable()))
      .query(({ input }) => `list: ${JSON.stringify(input)}`),
    test2: t.procedure
      .input(z.array(z.union([z.boolean(), z.number(), z.string()]).nullable()))
      .query(({ input }) => `list: ${JSON.stringify(input)}`),
  });

  const cli = createCli({ router });

  expect(cli.ignoredProcedures).toMatchInlineSnapshot(`
    [
      {
        "procedure": "test1",
        "reason": "Invalid input type ZodNullable<ZodString>[]. Nullable arrays are not supported.",
      },
      {
        "procedure": "test2",
        "reason": "Invalid input type ZodNullable<ZodUnion>[]. Nullable arrays are not supported.",
      },
    ]
  `);
});

test("string array input with options", async () => {
  const router = t.router({
    test: t.procedure
      .input(
        z.tuple([z.array(z.string()), z.object({ foo: z.string() }).optional()])
      )
      .query(({ input }) => `input: ${JSON.stringify(input)}`),
  });

  const cli = createCli({ router });
  expect(cli.ignoredProcedures).toEqual([]);

  const result = await run(router, ["test", "hello", "world", "--foo", "bar"]);
  expect(result).toMatchInlineSnapshot(
    `"input: [["hello","world"],{"foo":"bar"}]"`
  );

  const result2 = await run(router, ["test", "--foo", "bar", "hello", "world"]);
  expect(result2).toMatchInlineSnapshot(
    `"input: [["hello","world"],{"foo":"bar"}]"`
  );

  const result3 = await run(router, ["test", "hello", "--foo=bar", "world"]);
  expect(result3).toMatchInlineSnapshot(
    `"input: [["hello","world"],{"foo":"bar"}]"`
  );
});

test("mixed array input with options", async () => {
  const router = t.router({
    test: t.procedure
      .input(
        z.tuple([
          z.array(z.union([z.string(), z.number()])),
          z.object({ foo: z.string().optional() }),
        ])
      )
      .query(({ input }) => `input: ${JSON.stringify(input)}`),
  });

  const cli = createCli({ router });
  expect(cli.ignoredProcedures).toEqual([]);

  const result0 = await run(router, ["test", "hello", "1", "world"]);
  expect(result0).toMatchInlineSnapshot(`"input: [["hello",1,"world"],{}]"`);

  const result1 = await run(router, [
    "test",
    "hello",
    "1",
    "world",
    "--foo",
    "bar",
  ]);
  expect(result1).toMatchInlineSnapshot(
    `"input: [["hello",1,"world"],{"foo":"bar"}]"`
  );

  const result2 = await run(router, [
    "test",
    "--foo",
    "bar",
    "hello",
    "1",
    "world",
  ]);
  expect(result2).toMatchInlineSnapshot(
    `"input: [["hello",1,"world"],{"foo":"bar"}]"`
  );

  const result3 = await run(router, [
    "test",
    "hello",
    "world",
    "--foo=bar",
    "1",
  ]);
  expect(result3).toMatchInlineSnapshot(
    `"input: [["hello","world",1],{"foo":"bar"}]"`
  );
});
