/** Matches a normalized plugin route path against the request path. */
export function matchPluginRoutePath(pattern: string, actual: string): boolean {
  const expected = pattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const received = actual.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (expected.length !== received.length) return false;
  return expected.every((part, index) => part.startsWith(':') || part === '*' || part === received[index]);
}
