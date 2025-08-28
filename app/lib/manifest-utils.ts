export function withValidProperties<T extends Record<string, unknown>>(
  properties: T,
): Partial<T> {
  const entries = Object.entries(properties).flatMap(([key, value]) => {
    if (value == null) return []; // drop undefined/null
    if (Array.isArray(value)) {
      const filtered = value.filter((v) =>
        typeof v === "string" ? v.trim().length > 0 : v != null,
      );
      return filtered.length > 0 ? [[key, filtered]] : [];
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? [[key, trimmed]] : [];
    }
    if (typeof value === "boolean") {
      return value === true ? [[key, value]] : [];
    }
    return [[key, value]];
  });
  return Object.fromEntries(entries) as Partial<T>;
}
