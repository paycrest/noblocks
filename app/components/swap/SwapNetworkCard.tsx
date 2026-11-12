"use client";

import React, { useMemo } from "react";
import { networks } from "@/app/mocks";
import { classNames } from "@/app/utils";
import { BridgePicker } from "@/app/components/bridge/BridgePicker";
import type { BridgePickerItem } from "@/app/components/bridge/BridgePicker";
import { ArrowDown01Icon } from "hugeicons-react";
import { SWAP_COPY } from "./swapConfig";

function getNetworkImgSrc(network: (typeof networks)[0]): string {
  return typeof network.imageUrl === "string"
    ? network.imageUrl
    : (network.imageUrl as { light: string; dark: string }).dark;
}

interface SwapNetworkCardProps {
  selectedNetworkName: string | null;
  onSelect: (name: string) => void;
}

/** Figma frame 69/70: "Select network" heading over a full-width 44px input,
 * sitting inside the same 20px-radius shell as the From/to cards. */
export function SwapNetworkCard({
  selectedNetworkName,
  onSelect,
}: SwapNetworkCardProps) {
  const items: BridgePickerItem[] = useMemo(
    () =>
      networks.map((n) => ({
        id: n.chain.name,
        label: n.chain.name,
        imgSrc: getNetworkImgSrc(n),
      })),
    [],
  );
  const selectedNetwork = networks.find(
    (n) => n.chain.name === selectedNetworkName,
  );
  const previewNetworks = networks.slice(0, 3);

  return (
    <div
      className="flex w-full flex-col justify-end gap-4 rounded-2xl border-[0.3px] border-border-light bg-white p-4 dark:border-white/10 dark:bg-surface-canvas"
      data-testid="swap-network-card"
    >
      <p className="whitespace-nowrap font-general-sans text-base font-medium leading-6 text-black dark:text-white">
        {SWAP_COPY.selectNetwork}
      </p>
      <BridgePicker
        title="Select network"
        items={items}
        selectedId={selectedNetworkName ?? undefined}
        onSelect={onSelect}
        menuWidth={294}
        trigger={({ isOpen, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-label={SWAP_COPY.selectNetwork}
            className={classNames(
              "flex h-11 w-full items-center rounded-xl border border-border-input bg-white px-2 py-2.5 text-left shadow-[0px_0px_1px_rgba(18,18,23,0.02)] transition-colors hover:border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 dark:border-white/20 dark:bg-transparent dark:hover:border-white/40",
            )}
          >
            {selectedNetwork ? (
              <span className="flex shrink-0 items-center pl-1">
                <img
                  src={getNetworkImgSrc(selectedNetwork)}
                  alt=""
                  className="size-[18px] shrink-0 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </span>
            ) : (
              <span className="flex shrink-0 items-center pl-1" aria-hidden>
                {previewNetworks.map((n, i) => (
                  <img
                    key={n.chain.name}
                    src={getNetworkImgSrc(n)}
                    alt=""
                    className={classNames(
                      "size-[18px] shrink-0 rounded-full",
                      i < previewNetworks.length - 1 && "-mr-1.5",
                    )}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ))}
              </span>
            )}
            <span
              className={classNames(
                "min-w-0 flex-1 truncate px-2 font-inter text-sm font-normal leading-6",
                selectedNetworkName
                  ? "text-black opacity-80 dark:text-white"
                  : "text-text-placeholder dark:text-white/30",
              )}
            >
              {selectedNetworkName ?? SWAP_COPY.selectNetwork}
            </span>
            <span className="flex shrink-0 pr-1">
              <ArrowDown01Icon
                className={classNames(
                  "size-[18px] shrink-0 text-icon-outline-secondary transition-transform dark:text-white/50",
                  isOpen && "rotate-180",
                )}
                strokeWidth={1.5}
                aria-hidden
              />
            </span>
          </button>
        )}
      />
    </div>
  );
}
