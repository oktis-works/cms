export declare function looksLikeListenLog(text: string): boolean;
export declare function rewriteListenChunk(text: string, isWsl: boolean): string | null;
export declare function wrapLogMethod(
  owner: Record<string, unknown>,
  name: string,
  isWsl: boolean,
): (...args: unknown[]) => unknown;
export declare function installListenLogRewrite(consoleLike: Record<string, unknown>, isWsl: boolean): void;
