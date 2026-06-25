import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useInjectedWallet } from "../context";
import { useStarknet } from "../context/StarknetContext";
import { useTron } from "../context/TronContext";
import { useNetwork } from "../context/NetworksContext";
import { normalizeStarknetAddress } from "../utils";
import { useShouldUseEOA } from "./useEIP7702Account";

/**
 * Active wallet address for the selected network (matches WalletDetails / swap form).
 * Starknet → Starknet wallet; Tron → Tron wallet; EVM → embedded EOA when migrated / empty SCW, else smart wallet.
 */
export function useWalletAddress(): string | undefined {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const { address: starknetAddress } = useStarknet();
  const { address: tronAddress } = useTron();
  const { selectedNetwork } = useNetwork();
  const shouldUseEOA = useShouldUseEOA();

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
