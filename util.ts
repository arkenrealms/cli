export function looksLikeInstanceof<T>(
  value: unknown,
  target: new (...args: any[]) => T
): value is T {
  let proto = Object.getPrototypeOf(value);
  while (proto) {
    if (proto.constructor.name === target.name) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}
