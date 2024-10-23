"use client";
import Image from "next/image";
import { useRef, useState, useEffect } from "react";
import { useOutsideClick } from "../hooks";
import { publicClient } from "../client";
import { formatEther } from "viem";
import { usePrivy } from "@privy-io/react-auth";

export const WalletDetails = () => {
  const { ready, user } = usePrivy();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [balance, setBalance] = useState<string>("");

  const dropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: dropdownRef,
    handler: () => setIsOpen(false),
  });

  useEffect(() => {
    const fetchBalance = async () => {
      if (!ready || !user?.wallet?.address) return;
      const balance = await publicClient.getBalance({
        address: user?.wallet?.address as `0x${string}`,
      });
      setBalance(parseFloat(formatEther(balance)).toFixed(4));
    };

    fetchBalance();
  }, [ready, user]);

  if (!balance) return null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        title="Wallet balance"
        className="flex items-center justify-center gap-2 rounded-xl bg-gray-50 px-2 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
      >
        <div className="px-0.5 py-2.5">
          <Image
            src="/logos/privy-logo-black.svg"
            alt="Privy logo"
            width={0}
            height={0}
            className="size-4 dark:hidden"
          />
          <Image
            src="/logos/privy-logo-white.svg"
            alt="Privy logo"
            width={0}
            height={0}
            className="hidden size-4 dark:block"
          />
        </div>
        <div className="h-10 w-px border-r border-dashed border-gray-100 dark:border-white/10" />
        <div className="flex items-center gap-2 py-2.5 dark:text-white/80">
          <p className="pr-1">{balance} ETH</p>
        </div>
      </button>
    </div>
  );
};
