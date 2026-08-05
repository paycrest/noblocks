"use client";



import { useEffect, useRef } from "react";

import { usePrivy } from "@privy-io/react-auth";

import { useStarknet } from "../context/StarknetContext";

import { useEarnHandler } from "./useEarnHandler";

import {

  isLayerswapSuccessStatus,

  isLayerswapTerminalStatus,

} from "../lib/layerswap";

import {

  loadPendingEarnBridges,

  pendingBridgeReceiveBaseUnits,

  savePendingEarnBridges,

  writeEarnSourcePosition,

} from "../lib/earnPositionStore";



/**

 * Resumes in-flight EVM → Starknet earn bridges after refresh and completes

 * Vesu deposit once LayerSwap reports success.

 */

export function useEarnBridgeStatusTracker() {

  const { getAccessToken } = usePrivy();

  const { ensureWalletExists } = useStarknet();

  const { deposit, refreshPosition } = useEarnHandler();

  const runningRef = useRef(false);



  useEffect(() => {

    const tick = async () => {

      if (runningRef.current) return;

      const pending = loadPendingEarnBridges();

      if (pending.length === 0) return;



      runningRef.current = true;

      try {

        const token = await getAccessToken();

        if (!token) return;



        await ensureWalletExists();



        const remaining = [];

        for (const job of pending) {

          try {

            const res = await fetch(

              `/api/earn/layerswap/swap/status?id=${encodeURIComponent(job.swapId)}`,

            );

            const data = await res.json();

            const status = data.swap?.status as string | undefined;

            if (!status || !isLayerswapTerminalStatus(status as any)) {

              remaining.push(job);

              continue;

            }

            if (!isLayerswapSuccessStatus(status as any)) {

              continue;

            }



            let receiveBaseUnits = pendingBridgeReceiveBaseUnits(job);

            const quotedReceive = data.quote?.receive_amount;

            if (typeof quotedReceive === "number" && quotedReceive > 0) {

              receiveBaseUnits = BigInt(Math.round(quotedReceive * 1_000_000));

            }

            if (receiveBaseUnits <= BigInt(0)) {

              remaining.push(job);

              continue;

            }



            await deposit("USDC", receiveBaseUnits, {
              sourceChain: job.sourceChain,
            });

            writeEarnSourcePosition(

              job.evmAddress,

              {

                sourceChain: job.sourceChain,

                starknetAddress: job.starknetAddress,

                suppliedBaseUnits: receiveBaseUnits.toString(),

                suppliedFormatted: (Number(receiveBaseUnits) / 1e6).toFixed(6),

                supplyApy: null,

              },

              "USDC",

            );

            await refreshPosition("USDC");

          } catch {

            remaining.push(job);

          }

        }

        savePendingEarnBridges(remaining);

      } finally {

        runningRef.current = false;

      }

    };



    void tick();

    const id = window.setInterval(() => void tick(), 15_000);

    return () => clearInterval(id);

  }, [getAccessToken, ensureWalletExists, deposit, refreshPosition]);

}


