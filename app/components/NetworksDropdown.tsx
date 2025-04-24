"use client";
import Image from "next/image";
import { toast } from "sonner";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { networks } from "../mocks";
import {
  classNames,
  shouldUseInjectedWallet,
  handleNetworkSwitch,
} from "../utils";
import { FlexibleDropdown } from "./FlexibleDropdown";
import { ArrowDown01Icon } from "hugeicons-react";
import { useNetwork, useStep } from "../context";

interface NetworksDropdownProps {
  iconOnly?: boolean;
}

export const NetworksDropdown = ({
  iconOnly = false,
}: NetworksDropdownProps) => {
  const searchParams = useSearchParams();
  const { isFormStep } = useStep();
  const useInjectedWallet = shouldUseInjectedWallet(searchParams);

  iconOnly = !isFormStep;

  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const [dropdownSelectedItem, setDropdownSelectedItem] = useState<string>(
    selectedNetwork.chain.name,
  );

  const handleNetworkSelect = async (networkName: string) => {
    const newNetwork = networks.find((net) => net.chain.name === networkName);
    if (newNetwork) {
      handleNetworkSwitch(
        newNetwork,
        useInjectedWallet,
        setSelectedNetwork,
        () => {
          setDropdownSelectedItem(newNetwork.chain.name);
          if (!useInjectedWallet) {
            toast.success(`Network switched successfully`, {
              description: `You are now swapping on ${newNetwork.chain.name} network`,
            });
          }
        },
        (error) => {
          console.error("Failed to switch network:", error);
          toast.error("Error switching network", {
            description: error.message,
          });
        },
      );
    }
  };

  const dropdownNetworks = networks.map((network) => {
    return {
      name: network.chain.name,
      imageUrl:
        typeof network.imageUrl === "string"
          ? network.imageUrl
          : network.imageUrl.light,
      darkImageUrl:
        typeof network.imageUrl === "string"
          ? network.imageUrl
          : network.imageUrl.dark,
    };
  });

  return (
    <FlexibleDropdown
      data={dropdownNetworks}
      selectedItem={dropdownSelectedItem}
      onSelect={handleNetworkSelect}
      className="max-h-max min-w-56"
    >
      {({ isOpen, toggleDropdown }) => (
        <button
          id="networks-dropdown"
          aria-label="Toggle dropdown"
          aria-haspopup="true"
          type="button"
          onClick={() => {
            toggleDropdown();
          }}
          className={classNames(
            "flex h-9 items-center justify-center gap-1 rounded-xl bg-accent-gray p-2.5 duration-300 hover:bg-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:bg-white/10 dark:hover:bg-white/20 dark:focus-visible:ring-offset-neutral-900",
            iconOnly ? "pointer-events-none" : "",
          )}
        >
          <span>
            {selectedNetwork ? (
              <div className="flex items-center gap-2">
                <Image
                  alt={selectedNetwork.chain.name}
                  src={
                    typeof selectedNetwork.imageUrl === "string"
                      ? selectedNetwork.imageUrl
                      : selectedNetwork.imageUrl.dark
                  }
                  width={20}
                  height={20}
                  className="size-5 rounded-full dark:hidden"
                />
                <Image
                  alt={selectedNetwork.chain.name}
                  src={
                    typeof selectedNetwork.imageUrl === "string"
                      ? selectedNetwork.imageUrl
                      : selectedNetwork.imageUrl.light
                  }
                  width={20}
                  height={20}
                  className="hidden size-5 rounded-full dark:block"
                />
                {!iconOnly && (
                  <p className="hidden sm:block">
                    {selectedNetwork.chain.name}
                  </p>
                )}
              </div>
            ) : (
              <p>{iconOnly ? "Select" : "Select a network"}</p>
            )}
          </span>
          {!iconOnly && (
            <ArrowDown01Icon
              className={classNames(
                "size-4 text-icon-outline-secondary transition-transform duration-300 dark:text-white/50",
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
