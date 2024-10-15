import type { Log, Logger } from "./types";

export const lineByLineLogger = getLoggerTransformer((log) => {
  return (...args: unknown[]) => {
    const print = (items: unknown[], depth: number) => {
      if (items.length === 1 && Array.isArray(items[0]) && depth === 0) {
        (items[0] as unknown[]).forEach((item) => print([item], depth + 1));
      } else if (items.every(isPrimitive)) {
        log(...items);
      } else if (items.length === 1) {
        log(JSON.stringify(items[0], null, 2));
      } else {
        log(JSON.stringify(items, null, 2));
      }
    };
    print(args, 0);
  };
});

const isPrimitive = (value: unknown): value is string | number | boolean => {
  return ["string", "number", "boolean"].includes(typeof value);
};

/** Wraps individual log functions and returns a logger with transformed `info` and `error` methods */
function getLoggerTransformer(transform: (log: Log) => Log) {
  return (logger: Logger): Logger => {
    const info = logger.info ? transform(logger.info) : undefined;
    const error = logger.error ? transform(logger.error) : undefined;
    return { info, error };
  };
}

/**
 * A logger that logs primitives directly, arrays item-by-item, and objects as JSON.
 * Useful for logging structured data in a human-readable way.
 */
export const lineByLineConsoleLogger = lineByLineLogger(console);
