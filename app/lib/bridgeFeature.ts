import config from "./config";
import { HYPERFX_SUPPORTED_NETWORKS } from "./hyperfxNetworks";

export { HYPERFX_SUPPORTED_NETWORKS };

export function isBridgeUiVisible(): boolean {
  return config.bridgeEnabled;
}

export function isHyperfxSwapEnabled(): boolean {
  return config.bridgeEnabled && config.hyperfxEnabled;
}
