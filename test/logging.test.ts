import { beforeEach, expect, test, vi } from "vitest";
import { lineByLineLogger } from "../src/logging";

const info = vi.fn();
const error = vi.fn();
const mocks = { info, error };
const jsonish = lineByLineLogger(mocks);

beforeEach(() => {
  vi.clearAllMocks();
});

expect.addSnapshotSerializer({
  test: (val) => "calls" in val.mock,
  print: (val) =>
    val.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n"),
});

test("logging", () => {
  jsonish.info?.("Hello", "world");

  expect(info).toMatchInlineSnapshot(`Hello world`);
});

test("string array", () => {
  jsonish.info?.(["m1", "m2", "m3"]);

  expect(info).toMatchInlineSnapshot(`
    m1
    m2
    m3
  `);
});

test("primitives array", () => {
  jsonish.info?.(["m1", "m2", 11, true, "m3"]);

  expect(info).toMatchInlineSnapshot(`
    m1
    m2
    11
    true
    m3
  `);
});

test("array array", () => {
  jsonish.info?.([
    ["m1", "m2"],
    ["m3", "m4"],
  ]);

  expect(info).toMatchInlineSnapshot(`
    [
      "m1",
      "m2"
    ]
    [
      "m3",
      "m4"
    ]
  `);
});

test("multi primitives", () => {
  jsonish.info?.("m1", 11, true, "m2");
  jsonish.info?.("m1", 12, false, "m2");

  expect(info).toMatchInlineSnapshot(`
    m1 11 true m2
    m1 12 false m2
  `);
});

test("object array", () => {
  jsonish.info?.([{ name: "m1" }, { name: "m2" }, { name: "m3" }]);

  expect(info).toMatchInlineSnapshot(`
    {
      "name": "m1"
    }
    {
      "name": "m2"
    }
    {
      "name": "m3"
    }
  `);
});
