"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ActionDrawer,
  ActionSubmitButton,
} from "@/app/components/drawer";
import { useActualTheme } from "@/app/hooks/useActualTheme";
import {
  copy,
  copyDepositAddress,
  DepositAmountCard,
  DepositErrorModal,
  DepositNetworkCard,
  DepositPickerModal,
  DepositQrModal,
  DepositRateFooter,
  DepositUnsupported,
  useDepositQuoteRate,
  useGetDepositAddress,
  type DepositDetectedPayload,
  type DepositPicker,
  type DepositPreview,
  type DepositStep,
} from "@/app/components/deposit/DepositShared";
import {
  getDepositNetworkByChainName,
  isTokenSupportedOnNetwork,
} from "@/app/lib/deposit/deposit-drawer-config";

export type { DepositPreview as DepositDrawerPreview, DepositStep as DepositDrawerStep };

export type DepositDrawerProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  preferredTokenSymbol?: string;
  getDepositAddress?: (network: string) => Promise<{ address: string }>;
  isDark?: boolean;
  preview?: DepositPreview;
  /** Hook point for a future Moralis/deposit-detected toast. */
  onDepositDetected?: (payload: DepositDetectedPayload) => void;
};

export function DepositDrawerView({
  isOpen,
  onRequestClose,
  preferredTokenSymbol,
  getDepositAddress,
  isDark = false,
  preview,
}: DepositDrawerProps & {
  getDepositAddress: (network: string) => Promise<{ address: string }>;
}) {
  const [amount, setAmount] = useState(preview?.amount ?? "");
  const [token, setToken] = useState(
    preview?.token ?? preferredTokenSymbol ?? "",
  );
  const [chainName, setChainName] = useState(preview?.chainName ?? "");
  const [step, setStep] = useState<DepositStep>(preview?.step ?? "pick");
  const [picker, setPicker] = useState<DepositPicker>(preview?.picker ?? null);
  const [depositAddress, setDepositAddress] = useState(preview?.address ?? "");
  const [errorMessage, setErrorMessage] = useState(preview?.errorMessage ?? "");
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rateLabel = useDepositQuoteRate(
    token,
    chainName,
    preview ? (preview.rateLabel ?? null) : undefined,
    isOpen && !preview,
  );

  const reset = useCallback(() => {
    setAmount("");
    setToken(preferredTokenSymbol ?? "");
    setChainName("");
    setStep("pick");
    setPicker(null);
    setDepositAddress("");
    setErrorMessage("");
    setIsAddressCopied(false);
  }, [preferredTokenSymbol]);

  useEffect(() => {
    if (!preview) return;
    if (preview.token !== undefined) setToken(preview.token);
    if (preview.chainName !== undefined) setChainName(preview.chainName);
    if (preview.amount !== undefined) setAmount(preview.amount);
    if (preview.step !== undefined) setStep(preview.step);
    if (preview.picker !== undefined) setPicker(preview.picker);
    if (preview.address !== undefined) setDepositAddress(preview.address);
    if (preview.errorMessage !== undefined) {
      setErrorMessage(preview.errorMessage);
    }
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    if (!isOpen) reset();
  }, [isOpen, reset, preview]);

  useEffect(() => {
    if (preview) return;
    if (isOpen && preferredTokenSymbol) setToken(preferredTokenSymbol);
  }, [isOpen, preferredTokenSymbol, preview]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const selectedNetwork = getDepositNetworkByChainName(chainName);
  const comboSelected = Boolean(token && chainName);
  const comboSupported =
    comboSelected && isTokenSupportedOnNetwork(token, chainName);
  const unsupportedReason =
    comboSelected && !comboSupported
      ? copy.unsupportedReason(
          token,
          selectedNetwork?.displayName ?? chainName,
        )
      : null;
  const canContinue = Boolean(comboSupported);

  const loadAddress = async () => {
    if (!comboSupported) return;
    setStep("loading");
    setErrorMessage("");
    try {
      const result = await getDepositAddress(chainName);
      setDepositAddress(result.address);
      setStep("qr");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : copy.addressErrorBody,
      );
      setStep("error");
    }
  };

  const closeOverlay = () => {
    setStep("pick");
    setIsAddressCopied(false);
  };

  const handleCopy = async () => {
    if (!depositAddress) return;
    const ok = await copyDepositAddress(depositAddress);
    if (!ok) return;
    setIsAddressCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsAddressCopied(false), 2000);
  };

  return (
    <>
      <ActionDrawer
        isOpen={isOpen}
        title={copy.title}
        subtitle={copy.subtitle}
        onRequestClose={onRequestClose}
        bodyAlign="start"
        bodyClassName="gap-3"
        showPoweredByFooter={false}
      >
        <div data-testid="deposit-drawer" className="flex w-full flex-col gap-3">
          <DepositAmountCard
            amount={amount}
            token={token}
            onAmountChange={setAmount}
            onPreset={setAmount}
            onOpenTokenPicker={() => setPicker("token")}
          />
          <DepositNetworkCard
            chainName={chainName}
            isDark={isDark}
            onOpen={() => setPicker("network")}
          />
          <DepositUnsupported reason={unsupportedReason} />
          <ActionSubmitButton
            label={copy.continue}
            disabled={!canContinue}
            isSubmitting={step === "loading"}
            onClick={() => void loadAddress()}
          />
          <DepositRateFooter rateLabel={rateLabel} />
        </div>
      </ActionDrawer>

      <DepositPickerModal
        isOpen={isOpen && picker === "token"}
        kind="token"
        isDark={isDark}
        selectedId={token}
        onClose={() => setPicker(null)}
        onSelectToken={(symbol) => {
          setToken(symbol);
          setPicker(null);
        }}
      />
      <DepositPickerModal
        isOpen={isOpen && picker === "network"}
        kind="network"
        isDark={isDark}
        selectedId={chainName}
        onClose={() => setPicker(null)}
        onSelectNetwork={(name) => {
          setChainName(name);
          setPicker(null);
        }}
      />
      <DepositQrModal
        isOpen={isOpen && step === "qr"}
        layout="stacked"
        token={token}
        chainName={chainName}
        isDark={isDark}
        address={depositAddress}
        isAddressCopied={isAddressCopied}
        onCopy={() => void handleCopy()}
        onClose={closeOverlay}
      />
      <DepositErrorModal
        isOpen={isOpen && step === "error"}
        message={errorMessage}
        onClose={closeOverlay}
        onRetry={() => void loadAddress()}
      />
    </>
  );
}

export function DepositDrawer(props: DepositDrawerProps) {
  const sessionGetDepositAddress = useGetDepositAddress();
  const themeIsDark = useActualTheme();
  return (
    <DepositDrawerView
      {...props}
      getDepositAddress={props.getDepositAddress ?? sessionGetDepositAddress}
      isDark={props.isDark ?? themeIsDark}
    />
  );
}
