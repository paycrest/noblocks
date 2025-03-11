"use client";
import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";
import { createWalletClient, custom } from "viem";
import { celo } from "viem/chains";
import { toast } from "sonner";

interface MiniPayContextType {
  isMiniPay: boolean;
  miniPayAddress: string | null;
  miniPayProvider: any | null;
  miniPayReady: boolean;
}

const MiniPayContext = createContext<MiniPayContextType>({
  isMiniPay: false,
  miniPayAddress: null,
  miniPayProvider: null,
  miniPayReady: false,
});

export const MiniPayProvider = ({ children }: { children: ReactNode }) => {
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [miniPayAddress, setMiniPayAddress] = useState<string | null>(null);
  const [miniPayProvider, setMiniPayProvider] = useState<any | null>(null);
  const [miniPayReady, setMiniPayReady] = useState(false);

  useEffect(() => {
    const initMiniPay = async () => {
      const ethereumProvider = window.ethereum;
      const isActuallyMiniPay = ethereumProvider || ethereumProvider.isMiniPay;

      setIsMiniPay(!!isActuallyMiniPay);

      if (isActuallyMiniPay) {
        try {
          const client = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum),
          });

          await window.ethereum.request({ method: "eth_requestAccounts" });

          const [address] = await client.getAddresses();

          if (address) {
            setMiniPayProvider(window.ethereum);
            setMiniPayAddress(address);
            setMiniPayReady(true);
          } else {
            console.warn("No address returned from MiniPay.");
            toast.error(
              "Couldn't connect to MiniPay wallet. Please check your wallet connection.",
            );
          }
        } catch (error) {
          console.error("Failed to initialize MiniPay:", error);

          if ((error as any)?.code === 4001) {
            toast.error(
              "Connection to MiniPay was rejected. Please approve the connection request.",
            );
          } else {
            toast.error(
              "Failed to connect to MiniPay. Please refresh and try again.",
            );
          }
        }
      }
    };

    initMiniPay();
  }, []);

  return (
    <MiniPayContext.Provider
      value={{
        isMiniPay,
        miniPayAddress,
        miniPayProvider,
        miniPayReady,
      }}
    >
      {children}
    </MiniPayContext.Provider>
  );
};

export const useMiniPay = () => useContext(MiniPayContext);
