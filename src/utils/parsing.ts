export function parseInput(
  keyOrPair: string,
  value?: string
): { key: string; value: string } {
  let key: string;
  let parsedValue: string;

  if (value) {
    key = keyOrPair;
    parsedValue = value;
  } else {
    [key, parsedValue] = keyOrPair.split("=");
  }
  if (!key || !parsedValue) {
    throw new Error('Invalid input format. Use "key=value" or "key value".');
  }

  return { key, value: parsedValue };
}
