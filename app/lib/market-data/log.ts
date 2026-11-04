import "server-only";

export function logMarketDataWarning(
  event: string,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  console.warn(
    JSON.stringify({
      scope: "market-data",
      level: "warn",
      event,
      ...fields,
    }),
  );
}
