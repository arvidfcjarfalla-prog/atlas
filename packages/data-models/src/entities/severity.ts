import type { Severity } from "./base";

export const SEVERITY_PRIORITY: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Hex values for MapLibre paint expressions and inline styles. */
export const SEVERITY_HEX: Record<Severity, string> = {
  low: "#64748b",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

/** CSS variable references for DOM elements. Does NOT work in MapLibre. */
export const SEVERITY_COLOR: Record<Severity, string> = {
  low: "hsl(var(--muted-foreground))",
  medium: "hsl(var(--warning))",
  high: "hsl(var(--strike))",
  critical: "hsl(var(--destructive))",
};

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_PRIORITY[a] - SEVERITY_PRIORITY[b];
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return compareSeverity(a, b) >= 0 ? a : b;
}
