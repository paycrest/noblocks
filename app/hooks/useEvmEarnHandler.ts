"use client";

import { useCallback, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { Chain } from "viem";
import { useNetwork } from "../context/NetworksContext";
import { useStarknet } from "../context/StarknetContext";
import { useEarnHandler } from "./useEarnHandler";
import {
  earnBridgeConfirmationCopy,
  earnBridgeWithdrawCopy,
  type EvmEarnSourceChain,
  isEvmEarnSourceChain,
} from "../lib/earnChains";
import {
  isLayerswapSuccessStatus,
  isLayerswapTerminalStatus,
  type LayerswapDepositAction,
  type LayerswapQuote,
} from "../lib/layerswap";
import { buildLayerswapDepositBatchCalls } from "../lib/layerswapExecute";
import { executeBatchCalls } from "../lib/bridge";
import { useDelegationContractAuth } from "./useEIP7702Account";
import { getRpcUrl } from "../utils";
import {
  addEarnSourcePosition,
  clearEarnSourcePosition,
  loadPendingEarnBridges,
  patchPendingEarnBridge,
  pendingBridgeReceiveBaseUnits,
  savePendingEarnBridges,
  subtractEarnSourcePosition,
  upsertPendingEarnBridge,
  type PendingEarnBridgeJob,
} from "../lib/earnPositionStore";

const USDC_FACTOR = BigInt("1000000");

function humanToBaseUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

function baseUnitsToHuman(units: bigint): number {
  return Number(units) / 1_000_000;
}

export function useEvmEarnHandler() {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { selectedNetwork } = useNetwork();
  const {
    walletId,
    publicKey,
    address: starknetAddress,
    ensureWalletExists,
  } = useStarknet();
  const {
    deposit: vesuDeposit,
    withdraw: vesuWithdraw,
    refreshPosition,
  } = useEarnHandler();
  const { signDelegationAuthorization } = useDelegationContractAuth();

  const [quote, setQuote] = useState<LayerswapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [withdrawQuote, setWithdrawQuote] = useState<LayerswapQuote | null>(
    null,
  );
  const [withdrawQuoteLoading, setWithdrawQuoteLoading] = useState(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const evmAddress = embeddedWallet?.address?.toLowerCase();
  const sourceChain = selectedNetwork.chain.name;

  const confirmationCopy = earnBridgeConfirmationCopy(
    quote?.avg_completion_time,
  );
  const withdrawConfirmationCopy = earnBridgeWithdrawCopy(
    withdrawQuote?.avg_completion_time,
    sourceChain,
  );

  const fetchQuote = useCallback(
    async (amountHuman: number) => {
      if (!isEvmEarnSourceChain(sourceChain) || !starknetAddress) return null;
      if (!(amountHuman > 0)) {
        setQuote(null);
        return null;
      }
      setQuoteLoading(true);
      try {
        const res = await fetch(
          `/api/earn/layerswap/quote?sourceChain=${encodeURIComponent(sourceChain)}&amount=${encodeURIComponent(String(amountHuman))}&destinationAddress=${encodeURIComponent(starknetAddress)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Quote failed");
        setQuote(data.quote as LayerswapQuote);
        return data.quote as LayerswapQuote;
      } finally {
        setQuoteLoading(false);
      }
    },
    [sourceChain, starknetAddress],
  );

  const fetchWithdrawQuote = useCallback(
    async (amountHuman: number) => {
      if (!isEvmEarnSourceChain(sourceChain) || !evmAddress) return null;
      if (!(amountHuman > 0)) {
        setWithdrawQuote(null);
        return null;
      }
      setWithdrawQuoteLoading(true);
      try {
        const res = await fetch(
          `/api/earn/layerswap/withdraw-quote?destinationChain=${encodeURIComponent(sourceChain)}&amount=${encodeURIComponent(String(amountHuman))}&destinationAddress=${encodeURIComponent(evmAddress)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Quote failed");
        setWithdrawQuote(data.quote as LayerswapQuote);
        return data.quote as LayerswapQuote;
      } finally {
        setWithdrawQuoteLoading(false);
      }
    },
    [sourceChain, evmAddress],
  );

  const pollSwapUntilComplete = useCallback(
    async (swapId: string, accessToken: string) => {
      if (!walletId) throw new Error("Starknet wallet not ready");
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        const res = await fetch(
          `/api/earn/layerswap/swap/status?id=${encodeURIComponent(swapId)}&walletId=${encodeURIComponent(walletId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const data = await res.json();
        if (!res.ok) continue;
        const status = data.swap?.status as string | undefined;
        if (status && isLayerswapTerminalStatus(status as any)) {
          if (!isLayerswapSuccessStatus(status as any)) {
            throw new Error(data.swap?.fail_reason || "Bridge failed");
          }
          return;
        }
      }
      throw new Error("Bridge timed out");
    },
    [walletId],
  );

  const depositFromEvm = useCallback(
    async (amountHuman: number): Promise<{ txHash: string; swapId: string }> => {
      if (!embeddedWallet || !evmAddress) {
        throw new Error("EVM wallet not ready");
      }
      if (!isEvmEarnSourceChain(sourceChain)) {
        throw new Error("Earn is not supported on this network");
      }
      await ensureWalletExists();
      if (!starknetAddress || !walletId) {
        throw new Error("Starknet wallet not ready");
      }

      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Authentication required");

      const createRes = await fetch("/api/earn/layerswap/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sourceChain,
          amount: amountHuman,
          destinationAddress: starknetAddress,
          sourceAddress: evmAddress,
          refundAddress: evmAddress,
          walletId,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        throw new Error(created?.error || "Failed to create bridge swap");
      }

      const depositActions = (created.deposit_actions ||
        []) as LayerswapDepositAction[];
      const swapId = created.swap?.id as string;
      if (!swapId || depositActions.length === 0) {
        throw new Error("Invalid LayerSwap response");
      }

      const receiveAmount = created.quote?.receive_amount ?? amountHuman;
      const receiveBaseUnits = humanToBaseUnits(receiveAmount);
      const requestedBaseUnits = humanToBaseUnits(amountHuman);

      const job: PendingEarnBridgeJob = {
        swapId,
        sourceChain: sourceChain as EvmEarnSourceChain,
        evmAddress,
        starknetAddress,
        requestedAmountBaseUnits: requestedBaseUnits.toString(),
        receiveAmountBaseUnits: receiveBaseUnits.toString(),
        createdAt: Date.now(),
        claimedByLiveFlow: false,
      };
      upsertPendingEarnBridge(job);

      const chain = selectedNetwork.chain as Chain;
      const rpcUrl = getRpcUrl(chain.name);
      const calls = await buildLayerswapDepositBatchCalls({
        chain,
        rpcUrl: rpcUrl ?? "",
        fromAddress: evmAddress,
        tokenAmountBaseUnits: requestedBaseUnits,
        depositActions,
      });

      patchPendingEarnBridge(swapId, {
        claimedByLiveFlow: true,
        claimedAt: Date.now(),
      });

      const txHash = await executeBatchCalls({
        chain,
        calls,
        getAccessToken,
        embeddedWallet,
        signDelegationAuthorization,
        gasLimit: 800_000,
      });

      await pollSwapUntilComplete(swapId, accessToken);

      const { txHash: vesuTxHash } = await vesuDeposit("USDC", receiveBaseUnits, {
        sourceChain,
      });

      addEarnSourcePosition(
        evmAddress,
        {
          sourceChain: sourceChain as EvmEarnSourceChain,
          starknetAddress,
          deltaBaseUnits: receiveBaseUnits,
        },
        "USDC",
      );
      await refreshPosition("USDC");

      savePendingEarnBridges(
        loadPendingEarnBridges().filter((j) => j.swapId !== swapId),
      );

      return { txHash: vesuTxHash || txHash, swapId };
    },
    [
      embeddedWallet,
      evmAddress,
      sourceChain,
      ensureWalletExists,
      starknetAddress,
      walletId,
      getAccessToken,
      selectedNetwork.chain,
      signDelegationAuthorization,
      pollSwapUntilComplete,
      vesuDeposit,
      refreshPosition,
    ],
  );

  const withdrawToEvm = useCallback(
    async (params: {
      amountBaseUnits: bigint;
      useMax?: boolean;
    }): Promise<{ txHash: string; swapId: string }> => {
      const { amountBaseUnits, useMax = false } = params;
      if (amountBaseUnits <= BigInt(0)) {
        throw new Error("Withdraw amount must be greater than zero");
      }
      if (!embeddedWallet || !evmAddress) {
        throw new Error("EVM wallet not ready");
      }
      if (!isEvmEarnSourceChain(sourceChain)) {
        throw new Error("Earn is not supported on this network");
      }
      await ensureWalletExists();
      if (!starknetAddress || !walletId || !publicKey) {
        throw new Error("Starknet wallet not ready");
      }

      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Authentication required");

      const bridgeHuman = baseUnitsToHuman(amountBaseUnits);

      const { txHash: vesuTxHash } = await vesuWithdraw(
        "USDC",
        useMax ? "max" : amountBaseUnits,
        { sourceChain },
      );

      const createRes = await fetch("/api/earn/layerswap/withdraw-swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          destinationChain: sourceChain,
          amount: bridgeHuman,
          destinationAddress: evmAddress,
          sourceAddress: starknetAddress,
          refundAddress: starknetAddress,
          walletId,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        throw new Error(created?.error || "Failed to create withdraw bridge");
      }

      const depositActions = (created.deposit_actions ||
        []) as LayerswapDepositAction[];
      const swapId = created.swap?.id as string;
      if (!swapId || depositActions.length === 0) {
        throw new Error("Invalid LayerSwap withdraw response");
      }

      const depositRes = await fetch("/api/earn/layerswap/starknet-deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          walletId,
          publicKey,
          depositActions,
          origin: window.location.origin,
        }),
      });
      const deposited = await depositRes.json();
      if (!depositRes.ok || !deposited?.success) {
        throw new Error(deposited?.error || "LayerSwap Starknet deposit failed");
      }

      await pollSwapUntilComplete(swapId, accessToken);

      if (useMax) {
        clearEarnSourcePosition(evmAddress, sourceChain, "USDC");
      } else {
        subtractEarnSourcePosition(
          evmAddress,
          sourceChain,
          "USDC",
          amountBaseUnits,
        );
      }
      await refreshPosition("USDC");

      return {
        txHash: deposited.transactionHash || vesuTxHash,
        swapId,
      };
    },
    [
      embeddedWallet,
      evmAddress,
      sourceChain,
      ensureWalletExists,
      starknetAddress,
      walletId,
      publicKey,
      getAccessToken,
      vesuWithdraw,
      pollSwapUntilComplete,
      refreshPosition,
    ],
  );

  return {
    quote,
    quoteLoading,
    withdrawQuote,
    withdrawQuoteLoading,
    confirmationCopy,
    withdrawConfirmationCopy,
    fetchQuote,
    fetchWithdrawQuote,
    depositFromEvm,
    withdrawToEvm,
    isEvmEarnChain: isEvmEarnSourceChain(sourceChain),
  };
}
