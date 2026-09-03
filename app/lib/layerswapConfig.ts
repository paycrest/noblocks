const DEFAULT_LAYERSWAP_API_BASE = "https://api.layerswap.io";

/** Normalize LayerSwap base URL: HTTPS only, no trailing slash. */
export function resolveLayerswapApiBaseUrl(envValue: string | undefined): string {
  const raw = (envValue || DEFAULT_LAYERSWAP_API_BASE).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      console.warn(
        "LAYERSWAP_API_BASE_URL must use HTTPS; falling back to default",
      );
      return DEFAULT_LAYERSWAP_API_BASE;
    }
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.host}${pathname === "" ? "" : pathname}`;
  } catch {
    return DEFAULT_LAYERSWAP_API_BASE;
  }
}
