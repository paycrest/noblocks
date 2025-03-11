import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { fetchWalletBalance } from "../utils";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useNetwork } from "./NetworksContext";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { celo } from "viem/chains";
import { useMiniPay } from "./MiniPayContext";

interface WalletBalances {
  total: number;
  balances: Record<string, number>;
}

interface BalanceContextProps {
  smartWalletBalance: WalletBalances | null;
  externalWalletBalance: WalletBalances | null;
  miniPayBalance: WalletBalances | null;
  allBalances: {
    smartWallet: WalletBalances | null;
    externalWallet: WalletBalances | null;
    miniPay: WalletBalances | null;
  };
  refreshBalance: () => void;
}

const BalanceContext = createContext<BalanceContextProps | undefined>(
  undefined,
);

export const BalanceProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const { client } = useSmartWallets();
  const { selectedNetwork } = useNetwork();
  const { isMiniPay, miniPayAddress, miniPayReady, miniPayProvider } =
    useMiniPay();

  const [smartWalletBalance, setSmartWalletBalance] =
    useState<WalletBalances | null>(null);
  const [externalWalletBalance, setExternalWalletBalance] =
    useState<WalletBalances | null>(null);
  const [miniPayBalance, setMiniPayBalance] = useState<WalletBalances | null>(
    null,
  );

  const fetchBalances = async () => {
    if (ready && !isMiniPay) {
      const smartWalletAccount = user?.linkedAccounts.find(
        (account) => account.type === "smart_wallet",
      );
      const externalWalletAccount = wallets.find(
        (account) => account.connectorType === "injected",
      );

      if (client) {
        await client.switchChain({
          id: selectedNetwork.chain.id,
        });
      }

      await externalWalletAccount?.switchChain(selectedNetwork.chain.id);

      const publicClient = createPublicClient({
        chain: selectedNetwork.chain,
        transport: http(),
      });

      if (smartWalletAccount) {
        const result = await fetchWalletBalance(
          publicClient,
          smartWalletAccount.address,
        );
        setSmartWalletBalance(result);
      } else {
        setSmartWalletBalance(null);
      }

      if (externalWalletAccount) {
        const result = await fetchWalletBalance(
          publicClient,
          externalWalletAccount.address,
        );
        setExternalWalletBalance(result);
      } else {
        setExternalWalletBalance(null);
      }

      setMiniPayBalance(null);
    } else if (isMiniPay && miniPayReady && miniPayAddress && miniPayProvider) {
      try {
        const publicClient = createPublicClient({
          chain: celo,
          transport: http(),
        });

        const result = await fetchWalletBalance(publicClient, miniPayAddress);
        setMiniPayBalance(result);

        setSmartWalletBalance(null);
        setExternalWalletBalance(null);
      } catch (error) {
        console.error("Error fetching MiniPay balance:", error);
        setMiniPayBalance(null);
      }
    }
  };

  useEffect(() => {
    fetchBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, selectedNetwork, isMiniPay, miniPayReady, miniPayAddress]);

  const refreshBalance = () => {
    fetchBalances();
  };

  const allBalances = {
    smartWallet: smartWalletBalance,
    externalWallet: externalWalletBalance,
    miniPay: miniPayBalance,
  };

  return (
    <BalanceContext.Provider
      value={{
        smartWalletBalance,
        externalWalletBalance,
        miniPayBalance,
        allBalances,
        refreshBalance,
      }}
    >
      {children}
    </BalanceContext.Provider>
  );
};

export const useBalance = () => {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error("useBalance must be used within a BalanceProvider");
  }
  return context;
};
