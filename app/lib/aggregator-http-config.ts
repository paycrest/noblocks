/**
 * Server-side axios config for direct aggregator calls from `app/api/aggregator.ts`.
 * Kept separate from `aggregator-outbound-headers` so client bundles never pull
 * in dd-trace.
 */

type AggregatorAxiosExtra = {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  signal?: AbortSignal;
  timeout?: number;
  validateStatus?: (status: number) => boolean;
};

export async function withAggregatorOutboundHeaders<T extends AggregatorAxiosExtra>(
  extra: T,
): Promise<T> {
  if (typeof window !== "undefined") {
    return extra;
  }

  const { buildAggregatorOutboundHeaders } = await import(
    "./aggregator-outbound-headers"
  );
  const headers = await buildAggregatorOutboundHeaders(extra.headers ?? {});
  return { ...extra, headers };
}
