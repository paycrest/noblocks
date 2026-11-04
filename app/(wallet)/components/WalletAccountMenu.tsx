"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNoblocksLogout } from "@/app/hooks/useNoblocksLogout";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import { useOutsideClick } from "@/app/hooks";
import { copyToClipboard } from "@/app/utils";

export function WalletAccountMenu({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick({ ref, handler: () => setOpen(false) });

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && <AccountMenuPanel onClose={() => setOpen(false)} />}
    </div>
  );
}

function AccountMenuPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const walletAddress = useWalletAddress();
  const { signOut, isLoggingOut } = useNoblocksLogout();

  const items = [
    { label: "Profile", href: "/profile" },
    { label: "Settings", href: "/settings" },
    { label: "Beneficiaries", href: "/beneficiaries" },
  ];

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-full min-w-[190px] rounded-xl border border-border-light bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
      {items.map((item) => (
        <button
          key={item.href}
          type="button"
          className="block w-full px-3 py-2 text-left text-sm font-medium text-text-body hover:bg-accent-gray dark:text-white dark:hover:bg-white/10"
          onClick={() => {
            onClose();
            router.push(item.href);
          }}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        className="block w-full px-3 py-2 text-left text-sm font-medium text-text-body hover:bg-accent-gray dark:text-white dark:hover:bg-white/10"
        onClick={() => {
          onClose();
          if (walletAddress) {
            void copyToClipboard(walletAddress, "Address");
          }
        }}
      >
        My wallet address
      </button>
      <button
        type="button"
        disabled={isLoggingOut}
        className="block w-full px-3 py-2 text-left text-sm font-medium text-accent-red hover:bg-background-accent-red dark:text-red-400"
        onClick={() => {
          onClose();
          void signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
