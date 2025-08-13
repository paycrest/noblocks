export function withValidProperties(
  properties: Record<string, undefined | string | string[]>,
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return !!value;
    }),
  );
}
