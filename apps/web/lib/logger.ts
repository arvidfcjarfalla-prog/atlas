export function log(event: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

export type DiagnosticSeverity = "info" | "warning" | "error";

/**
 * Structured diagnostic log for data source failures.
 * Replaces silent `.catch(() => ...)` swallowing with visible diagnostics.
 */
export function logDiagnostic(
  severity: DiagnosticSeverity,
  phase: string,
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  const message = error instanceof Error ? error.message : String(error);
  log(`diagnostic.${phase}.${source}`, {
    severity,
    source,
    error: message,
    ...context,
  });
}

/** Extract a loggable error message from an unknown catch value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
