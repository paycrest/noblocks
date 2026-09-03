import config from "./config";
import { isEvmEarnSourceChain } from "./earnChains";

/** Master Earn feature flag (Phase 1 + optional Phase 2). */
export function isEarnEnabled(): boolean {
  return config.earnEnabled;
}

/** EVM → Starknet earn (LayerSwap + Vesu). */
export function isEvmEarnEnabled(): boolean {
  return config.earnEnabled && config.evmEarnEnabled;
}

/** Show full Earn UI (hub, deposit, position) on this chain. */
export function isEarnUiVisible(chainName: string): boolean {
  if (!isEarnEnabled()) return false;
  if (chainName === "Starknet") return true;
  return isEvmEarnEnabled() && isEvmEarnSourceChain(chainName);
}

/** Show Earn action button in wallet (including unavailable hint on unsupported chains). */
export function isEarnActionVisible(_chainName: string): boolean {
  return isEarnEnabled();
}

export function isEvmEarnFlow(chainName: string): boolean {
  return isEvmEarnEnabled() && isEvmEarnSourceChain(chainName);
}

export function isStarknetEarnFlow(chainName: string): boolean {
  return isEarnEnabled() && chainName === "Starknet";
}

/** Activity scoped to the wallet view the user is on (see earn user story #4). */
export function filterEarnActivityForChain<
  T extends { sourceChain?: string; type?: string },
>(
  entries: T[],
  chainName: string,
  options?: { includeLegacyUntaggedDeposits?: boolean },
): T[] {
  if (chainName === "Starknet") {
    return entries.filter(
      (e) => !e.sourceChain || e.sourceChain === "Starknet",
    );
  }
  if (isEvmEarnFlow(chainName)) {
    return entries.filter(
      (e) =>
        e.sourceChain === chainName ||
        (options?.includeLegacyUntaggedDeposits &&
          !e.sourceChain &&
          e.type === "deposit"),
    );
  }
  return [];
}
