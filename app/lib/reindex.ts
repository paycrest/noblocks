import { reindexTransaction } from "../api/aggregator";
import { normalizeNetworkForRateFetch } from "../utils";
import { networks } from "../mocks";

/**
 * Helper function for exponential backoff delay
 */
const getExponentialDelay = (attempt: number): number => {
  return Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
};

/**
 * Reindexes a single transaction with retry logic
 * @param txHash - The transaction hash to reindex
 * @param network - The network name (will be normalized to API format)
 * @returns Promise that resolves when reindexing is complete or fails
 */
export async function reindexSingleTransaction(
  txHash: string,
  network: string,
): Promise<void> {
  const maxRetries = 3;

  // Validate required fields
  if (!txHash || !network) {
    return;
  }

  // Convert network name to API format
  const apiNetwork = normalizeNetworkForRateFetch(network);

  // Only reindex if network is supported
  const supportedNetworks = networks.map((network) =>
    normalizeNetworkForRateFetch(network.chain.name),
  );
  if (!supportedNetworks.includes(apiNetwork)) {
    console.warn(
      `Reindex not supported for network: ${network} (${apiNetwork})`,
    );
    return;
  }

  // Retry loop for OrderCreated validation
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await reindexTransaction(apiNetwork, txHash);

      // Extract OrderCreated event count from response
      const orderCreated = Number(response?.events?.OrderCreated ?? 0);
      const hasValidOrderCreated = orderCreated > 0;

      if (hasValidOrderCreated) {
        console.log(
          `Transaction reindexed: ${txHash} on ${apiNetwork}, OrderCreated: ${orderCreated}`,
        );
        return;
      }

      if (attempt === maxRetries) {
        console.warn(
          `Reindex completed but OrderCreated is ${orderCreated} for tx ${txHash} on ${apiNetwork} after ${maxRetries + 1} attempts`,
        );
        return;
      }
    } catch (error: any) {
      // Don't retry on 4xx client errors (bad request, invalid tx hash, etc.)
      // These are permanent errors, not transient
      const status = error?.response?.status;
      const is4xxError = status !== undefined && status >= 400 && status < 500;
      
      if (is4xxError || attempt === maxRetries) {
        console.error(
          `Error reindexing transaction ${txHash} on ${apiNetwork} after ${
            attempt + 1
          } attempt(s)${is4xxError ? " (4xx client error)" : ""}:`,
          error,
        );
        // Re-throw error so caller can handle cleanup
        throw error;
      }
      // For network/5xx errors, fall through to schedule next attempt
    }

    const delay = getExponentialDelay(attempt);
    console.log(
      `OrderCreated not found for tx ${txHash} on ${apiNetwork}, retrying in ${delay}ms (attempt ${
        attempt + 1
      }/${maxRetries})`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
