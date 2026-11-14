import "server-only";

/**
 * Next.js Cache Components aborts in-flight uncached fetches when a prerender finishes. The abort surfaces
 * through supabase-js as an error whose message starts with "During prerendering, fetch() rejects…".
 * That is expected and handled by React, so it is not worth a server-log line (and hides real failures).
 */
export function isPrerenderAbortMessage(message: string | null | undefined) {
  return typeof message === "string" && message.includes("During prerendering");
}

/** Server-log line with the error code and message only (no row data), so a failing call can be diagnosed from the logs. */
export function logDbError(label: string, error: { code?: string | null; message?: string | null }) {
  if (isPrerenderAbortMessage(error.message)) return;
  console.error(`${label} [${error.code || "no-code"}] ${error.message ?? ""}`);
}
