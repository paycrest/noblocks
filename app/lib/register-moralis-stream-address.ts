import config from "./config";
/**
 * Add a wallet address to the configured Moralis EVM stream (e.g. after a new user gets a wallet).
 * Server-only; uses MORALIS_API_KEY and MORALIS_STREAM_ID.
 */
export async function registerWalletForMoralisStream(
  walletAddress: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const address = walletAddress.trim().toLowerCase();
  const streamId = config.moralisStreamId;
  const apiKey = config.moralisApiKey;
  if (!streamId || !apiKey) {
    return { ok: false, error: "MORALIS_STREAM_ID or MORALIS_API_KEY not set" };
  }
  if (!address.startsWith("0x") || address.length !== 42) {
    return { ok: false, error: "invalid address" };
  }
  const res = await fetch(
    `${config.moralisBaseUrl}/streams/evm/${encodeURIComponent(streamId)}/address`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ address }),
    },
  );
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
