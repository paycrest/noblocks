import config from "./config";

export function isBridgeUiVisible(): boolean {
  return config.bridgeEnabled;
}
