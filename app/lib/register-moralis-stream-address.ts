import config from "./config";
/**
 * Add a wallet address to the configured Moralis EVM stream (e.g. after a new user gets a wallet).
 * Server-only; uses MORALIS_API_KEY, MORALIS_STREAM_ID, and MORALIS_BASE_URL.
 */
export async function registerWalletForMoralisStream(
  walletAddress: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const address = walletAddress.trim().toLowerCase();
  const streamId = config.moralisStreamId;
  const apiKey = config.moralisApiKey;
  const baseUrl = (config.moralisBaseUrl || "").trim();
  if (!streamId || !apiKey || !baseUrl) {
    return {
      ok: false,
      error:
        "MORALIS_STREAM_ID, MORALIS_API_KEY, or MORALIS_BASE_URL not set",
    };
  }
  if (!address.startsWith("0x") || address.length !== 42) {
    return { ok: false, error: "invalid address" };
  }
  const timeoutMs = 8_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/streams/evm/${encodeURIComponent(streamId)}/address`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({ address }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Moralis request timeout" };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 400 || res.status === 409) {
      if (/duplicate|already|exist/i.test(text)) {
        return { ok: true };
      }
    }
    return { ok: false, error: `Moralis ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}
