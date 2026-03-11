export const ARKEN_CLI_INTERACTIVE_READY_ENV = 'ARKEN_CLI_INTERACTIVE_READY_MARKER';
export const ARKEN_CLI_INTERACTIVE_READY_LINE = 'ARKEN CLI interactive ready';

export function maybeEmitInteractiveReadyMarker(
  processLike: {
    env?: NodeJS.ProcessEnv;
    stdout?: { write?: (chunk: string) => unknown };
  } = process
) {
  if (processLike.env?.[ARKEN_CLI_INTERACTIVE_READY_ENV] !== '1') {
    return false;
  }

  processLike.stdout?.write?.(`${ARKEN_CLI_INTERACTIVE_READY_LINE}\n`);
  return true;
}
