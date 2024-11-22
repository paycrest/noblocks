"use client";
import Image from "next/image";
import { toast } from "sonner";
import { useState } from "react";
import { PiCaretDown } from "react-icons/pi";
import { getEmbeddedConnectedWallet, useWallets } from "@privy-io/react-auth";

import { networks } from "../mocks";
import { classNames } from "../utils";
import { FlexibleDropdown } from "./FlexibleDropdown";
import { useStep } from "../context/StepContext";
import { useNetwork } from "../context/NetworksContext";

interface NetworksDropdownProps {
  iconOnly?: boolean;
}

export const NetworksDropdown = ({
  iconOnly = false,
}: NetworksDropdownProps) => {
  const { wallets } = useWallets();
  const wallet = getEmbeddedConnectedWallet(wallets);

  const { isFormStep } = useStep();
  iconOnly = !isFormStep;

  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const [dropdownSelectedItem, setDropdownSelectedItem] = useState<string>(
    selectedNetwork.name,
  );

  const handleNetworkSelect = async (networkName: string) => {
    const newNetwork = networks.find((net) => net.name === networkName);
    if (newNetwork && wallet) {
      try {
        await wallet.switchChain(newNetwork.chainId);
        toast.success(`Network switched successfully`, {
          description: `You are now swapping on ${newNetwork.name} network`,
        });
        setSelectedNetwork(newNetwork);
        setDropdownSelectedItem(newNetwork.name);
      } catch (error) {
        console.error("Failed to switch network:", error);
        toast.error("Error switching network", {
          description: (error as Error).message,
        });
        setDropdownSelectedItem(selectedNetwork.name);
      }
    }
  };

  return (
    <FlexibleDropdown
      data={networks}
      selectedItem={dropdownSelectedItem}
      onSelect={handleNetworkSelect}
      className="max-h-max min-w-52"
    >
      {({ isOpen, toggleDropdown }) => (
        <button
          id="networks-dropdown"
          aria-label="Toggle dropdown"
          aria-haspopup="true"
          aria-expanded={isOpen}
          type="button"
          onClick={toggleDropdown}
          className={classNames(
            "flex items-center justify-center gap-2 rounded-xl bg-gray-50 p-2.5 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900",
            iconOnly ? "pointer-events-none" : "",
          )}
        >
          <span>
            {selectedNetwork ? (
              <div className="flex items-center gap-2">
                <Image
                  alt={selectedNetwork.name}
                  src={selectedNetwork.imageUrl ?? ""}
                  width={20}
                  height={20}
                  className="size-auto"
                />
                {!iconOnly && (
                  <p className="hidden sm:block">{selectedNetwork.name}</p>
                )}
              </div>
            ) : (
              <p>{iconOnly ? "Select" : "Select a network"}</p>
            )}
          </span>
          {!iconOnly && (
            <PiCaretDown
              className={classNames(
                "text-base text-gray-400 transition-transform dark:text-white/50",
                isOpen ? "rotate-180" : "",
              )}
              aria-label="Caret down"
            />
          )}
        </button>
      )}
    </FlexibleDropdown>
  );
};
