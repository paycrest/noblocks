import { usePrivy, useWallets } from "@privy-io/react-auth";
// Import contexts directly (not the barrel) so KYCContext can use this hook
// without a circular dependency through app/context/index.ts.
import { useInjectedWallet } from "../context/InjectedWalletContext";
import { useStarknet } from "../context/StarknetContext";
import { useTron } from "../context/TronContext";
import { useSolana } from "../context/SolanaContext";
import { useNetwork } from "../context/NetworksContext";
import { normalizeStarknetAddress, isSolanaChain } from "../utils";
import { useShouldUseEOA } from "./useEIP7702Account";

/**
 * Active wallet address for the selected network (matches WalletDetails / swap form / Profile).
 * Injected mode → injected EOA; Starknet → Starknet wallet; Tron → Tron wallet;
 * EVM → embedded EOA when migrated / empty SCW, else smart wallet.
 */
export function useWalletAddress(): string | undefined {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const { address: starknetAddress } = useStarknet();
  const { address: tronAddress } = useTron();
  const { address: solanaAddress } = useSolana();
  const { selectedNetwork } = useNetwork();
  const shouldUseEOA = useShouldUseEOA();

  if (isSolanaChain(selectedNetwork?.chain)) {
    return solanaAddress ?? undefined;
  }

  if (isInjectedWallet) {
    return injectedAddress ?? undefined;
  }

  if (selectedNetwork?.chain?.name === "Starknet") {
    if (!starknetAddress) {
      return undefined;
    }
    try {
      const address = normalizeStarknetAddress(starknetAddress);
      return address ?? starknetAddress;
    } catch {
      return undefined;
    }
  }

  if (selectedNetwork?.chain?.name === "Tron") {
    return tronAddress ?? undefined;
  }

  const embeddedLinked = user?.linkedAccounts?.find(
    (account) =>
      account.type === "wallet" &&
      (account as { connectorType?: string }).connectorType === "embedded" &&
      typeof (account as { address?: string }).address === "string",
  ) as { address?: string } | undefined;
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const smartWallet = user?.linkedAccounts?.find(
    (account) => account.type === "smart_wallet",
  ) as { address?: string } | undefined;

  if (shouldUseEOA) {
    return embeddedLinked?.address ?? embeddedWallet?.address;
  }
  return smartWallet?.address;
}
