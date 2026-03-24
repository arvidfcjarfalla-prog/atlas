/**
 * Lightweight error reporter.
 *
 * In production with SENTRY_DSN set: sends errors to Sentry via their HTTP API.
 * Without SENTRY_DSN: logs to stdout (picked up by Vercel logs).
 *
 * No SDK dependency — uses fetch to POST to Sentry's envelope endpoint.
 */

const SENTRY_DSN = process.env.SENTRY_DSN;

interface ErrorContext {
  route?: string;
  prompt?: string;
  userId?: string;
  [key: string]: unknown;
}

export function reportError(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));

  // Always log to stdout for Vercel logs
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "error",
      error: err.message,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
      ...context,
    }),
  );

  // If Sentry DSN is configured, send via HTTP
  if (SENTRY_DSN) {
    sendToSentry(err, context).catch(() => {
      /* fire and forget */
    });
  }
}

async function sendToSentry(
  error: Error,
  context?: ErrorContext,
): Promise<void> {
  // Parse DSN: https://<key>@<host>/<project_id>
  const match = SENTRY_DSN!.match(/^https?:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return;

  const [, key, host, projectId] = match;
  const url = `https://${host}/api/${projectId}/envelope/`;

  const envelope = [
    JSON.stringify({
      event_id: crypto.randomUUID().replace(/-/g, ""),
      sent_at: new Date().toISOString(),
      dsn: SENTRY_DSN,
    }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      exception: {
        values: [
          {
            type: error.name,
            value: error.message,
            stacktrace: error.stack
              ? {
                  frames: error.stack
                    .split("\n")
                    .slice(1, 10)
                    .map((line) => ({ filename: line.trim() })),
                }
              : undefined,
          },
        ],
      },
      tags: context?.route ? { route: context.route } : undefined,
      extra: context,
      platform: "node",
      level: "error",
      timestamp: Math.floor(Date.now() / 1000),
    }),
  ].join("\n");

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=atlas/1.0, sentry_key=${key}`,
    },
    body: envelope,
    signal: AbortSignal.timeout(5000),
  });
}
