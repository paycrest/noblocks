"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { Cancel01Icon, Search01Icon } from "hugeicons-react";

import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { drawerCloseButtonClasses } from "@/app/components/drawer/drawerStyles";
import { classNames } from "@/app/utils";

import {
  formatTransferTokenBalance,
  formatTransferTokenUsd,
  TRANSFER_MODAL_SCRIM,
  TRANSFER_PICKER_SHELL,
  TRANSFER_COPY,
  type TransferNetworkOption,
} from "./transferConfig";

export type TransferTokenOption = {
  symbol: string;
  name: string;
  imageUrl?: string;
  balance: number;
};

type PickTokenProps = {
  kind: "token";
  isOpen: boolean;
  onClose: () => void;
  tokens: TransferTokenOption[];
  selectedSymbol?: string;
  onSelectToken: (symbol: string) => void;
};

type PickNetworkProps = {
  kind: "network";
  isOpen: boolean;
  onClose: () => void;
  networks: TransferNetworkOption[];
  selectedName?: string;
  onSelectNetwork: (name: string) => void;
};

export type TransferPickerModalProps = PickTokenProps | PickNetworkProps;

export function TransferPickerModal(props: TransferPickerModalProps) {
  const { kind, isOpen, onClose } = props;
  const [query, setQuery] = useState("");
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  const title =
    kind === "token" ? TRANSFER_COPY.selectToken : TRANSFER_COPY.selectNetwork;
  const placeholder =
    kind === "token"
      ? TRANSFER_COPY.searchToken
      : TRANSFER_COPY.searchNetwork;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTokens = (
    props.kind === "token" ? props.tokens : []
  ).filter(
    (token) =>
      !normalizedQuery ||
      token.symbol.toLowerCase().includes(normalizedQuery) ||
      token.name.toLowerCase().includes(normalizedQuery),
  );
  const filteredNetworks = (
    props.kind === "network" ? props.networks : []
  ).filter(
    (network) =>
      !normalizedQuery || network.name.toLowerCase().includes(normalizedQuery),
  );

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="361px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName={TRANSFER_PICKER_SHELL}
      ariaLabelledBy={titleId}
      scrimClassName={TRANSFER_MODAL_SCRIM}
    >
      <div
        className={classNames(
          "flex flex-col gap-4",
          kind === "token" ? "h-[333px]" : "h-[432px]",
        )}
        data-testid={`transfer-${kind}-picker`}
      >
        <div className="flex items-center justify-between">
          <p
            id={titleId}
            className="text-xl font-semibold leading-7 text-text-primary dark:text-white"
          >
            {title}
          </p>
          <button
            type="button"
            aria-label="Close"
            className={drawerCloseButtonClasses}
            onClick={onClose}
          >
            <Cancel01Icon className="size-5" aria-hidden />
          </button>
        </div>

        <label className="flex h-12 items-center gap-0 rounded-2xl border-[0.5px] border-border-light bg-background-neutral px-3 py-2.5 shadow-[0_0_1px_rgba(18,18,23,0.02)] dark:border-white/10 dark:bg-white/[0.04]">
          <Search01Icon className="size-5 shrink-0 text-icon-outline-secondary dark:text-white/50" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent px-2 text-base font-medium leading-6 text-text-body outline-none placeholder:text-text-placeholder dark:text-white dark:placeholder:text-white/30"
          />
        </label>

        <div className="min-h-0 flex-1 overflow-y-auto pb-5">
          {props.kind === "token" ? (
            <ul className="flex flex-col gap-4">
              {filteredTokens.map((token) => {
                const selected = props.selectedSymbol === token.symbol;
                return (
                  <li key={token.symbol}>
                    <button
                      type="button"
                      data-testid={`transfer-token-option-${token.symbol}`}
                      onClick={() => props.onSelectToken(token.symbol)}
                      className="flex min-h-[46px] w-full items-center gap-3 text-left"
                      aria-pressed={selected}
                    >
                      {token.imageUrl ? (
                        <Image
                          src={token.imageUrl}
                          alt=""
                          width={44}
                          height={44}
                          className="size-11 shrink-0"
                        />
                      ) : (
                        <span className="size-11 shrink-0 rounded-full bg-accent-gray dark:bg-white/10" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium leading-6 text-text-primary dark:text-white">
                          {token.symbol}
                        </span>
                        <span className="block truncate text-sm leading-5 text-text-secondary dark:text-white/50">
                          {formatTransferTokenBalance(token.balance)}{" "}
                          {token.symbol}
                        </span>
                      </span>
                      <span className="shrink-0 text-base font-medium text-text-primary dark:text-white">
                        {formatTransferTokenUsd(token.symbol, token.balance)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="flex flex-col gap-4">
              {filteredNetworks.map((network) => {
                const selected = props.selectedName === network.name;
                return (
                  <li key={network.name}>
                    <button
                      type="button"
                      data-testid={`transfer-network-option-${network.name}`}
                      onClick={() => props.onSelectNetwork(network.name)}
                      className="flex min-h-11 w-full items-center gap-3 text-left"
                      aria-pressed={selected}
                    >
                      {network.imageUrl ? (
                        <Image
                          src={network.imageUrl}
                          alt=""
                          width={40}
                          height={40}
                          className="size-10 shrink-0"
                        />
                      ) : (
                        <span className="size-10 shrink-0 rounded-full bg-accent-gray dark:bg-white/10" />
                      )}
                      <span className="truncate text-base font-medium leading-6 text-text-primary dark:text-white">
                        {network.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
}
