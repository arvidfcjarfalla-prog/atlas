/**
 * Shared JSON parser for World Bank API responses.
 *
 * The WB API intermittently returns XML/HTML for some indicators.
 * This guard ensures callers get a proper JSON parse error instead
 * of silently ingesting markup.
 */
export async function parseWbJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("xml") || ct.includes("html")) {
    throw new Error(`World Bank API returned non-JSON content-type: ${ct}`);
  }
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("World Bank API returned XML/HTML body");
  }
  return JSON.parse(text);
}
