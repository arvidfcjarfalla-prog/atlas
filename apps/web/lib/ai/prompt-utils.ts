/**
 * Shared utilities for AI prompt builders.
 */

const MAX_STRING_LENGTH = 500;

/** Deep-clone a value, truncating all strings to MAX_STRING_LENGTH. */
export function truncateStrings<T>(value: T): T {
  if (typeof value === "string") {
    return (value.length > MAX_STRING_LENGTH
      ? value.slice(0, MAX_STRING_LENGTH)
      : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(truncateStrings) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = truncateStrings(v);
    }
    return out as T;
  }
  return value;
}
