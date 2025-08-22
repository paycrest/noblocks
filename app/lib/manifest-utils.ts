export function withValidProperties<T extends Record<string, unknown>>(
  properties: T,
): Partial<T> {
  const entries = Object.entries(properties).filter(([, value]) => {
    if (value == null) return false; // undefined/null
    if (Array.isArray(value)) {
      // filter out empty/whitespace-only string items and drop if resulting array is empty
      const filtered = value.filter((v) =>
        typeof v === "string" ? v.trim().length > 0 : v != null,
      );
      return filtered.length > 0;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (typeof value === "boolean") {
      return value === true; // include only true (e.g., noindex)
    }
    return true;
  });
  return Object.fromEntries(entries) as Partial<T>;
}
