export type SafeErrorLog = { name: string; code?: string };

/**
 * Loggable summary of an unknown error. Never includes message, params, query,
 * cause or stack: a Drizzle error embeds the SQL and its parameters (ids, search text).
 */
export function safeErrorLog(error: unknown): SafeErrorLog {
  if (typeof error !== "object" || error === null) return { name: "UnknownError" };
  const { name, code } = error as { name?: unknown; code?: unknown };
  const result: SafeErrorLog = { name: typeof name === "string" && name ? name : "Error" };
  if (typeof code === "string") result.code = code;
  return result;
}
