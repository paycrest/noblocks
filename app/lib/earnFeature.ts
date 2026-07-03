import config from "./config";

/** Client feature flag: Starknet Earn (Vesu / Starkzap). */
export function isEarnEnabled(): boolean {
  return config.earnEnabled;
}

export function isEarnUiVisible(chainName: string): boolean {
  return isEarnEnabled() && chainName === "Starknet";
}
