import "server-only";

export function logMarketDataInfo(
  event: string,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  console.log(
    JSON.stringify({
      scope: "market-data",
      level: "info",
      event,
      ...fields,
    }),
  );
}

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
