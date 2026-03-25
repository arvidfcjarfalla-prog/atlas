/**
 * Generate a URL-friendly slug from a title string.
 * Appends a 4-char random suffix to avoid collisions.
 *
 * Example: "BNP per capita i Europa" → "bnp-per-capita-i-europa-a3x7"
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (å→a, ö→o, etc.)
    .replace(/[^a-z0-9\s-]/g, "") // remove non-alphanumeric
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, "") // trim leading/trailing hyphens
    .slice(0, 60); // cap length

  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : suffix;
}
