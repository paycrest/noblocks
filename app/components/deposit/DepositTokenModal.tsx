"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ActionSubmitButton } from "@/app/components/drawer";
import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { useActualTheme } from "@/app/hooks/useActualTheme";
import {
  copy,
  copyDepositAddress,
  DEPOSIT_SCRIM,
  DEPOSIT_TOKEN_MODAL_SHELL,
  DepositBeforeYouContinue,
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

export type DepositTokenModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  tokenSymbol: string;
  getDepositAddress?: (network: string) => Promise<{ address: string }>;
  isDark?: boolean;
  preview?: DepositPreview;
  onDepositDetected?: (payload: DepositDetectedPayload) => void;
};

export function DepositTokenModalView({
  isOpen,
  onRequestClose,
  tokenSymbol,
  getDepositAddress,
  isDark = false,
  preview,
}: DepositTokenModalProps & {
  getDepositAddress: (network: string) => Promise<{ address: string }>;
}) {
  const token = preview?.token ?? tokenSymbol;
  const [chainName, setChainName] = useState(preview?.chainName ?? "");
  const [acknowledged, setAcknowledged] = useState(
    preview?.acknowledged ?? false,
  );
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
    setChainName("");
    setAcknowledged(false);
    setStep("pick");
    setPicker(null);
    setDepositAddress("");
    setErrorMessage("");
    setIsAddressCopied(false);
  }, []);

  useEffect(() => {
    if (!preview) return;
    if (preview.chainName !== undefined) setChainName(preview.chainName);
    if (preview.acknowledged !== undefined) {
      setAcknowledged(preview.acknowledged);
    }
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
  const canContinue = Boolean(comboSupported && acknowledged);
  const formOpen = isOpen && step !== "qr" && step !== "error";

  const loadAddress = async () => {
    if (!canContinue) return;
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
      <AnimatedModal
        isOpen={formOpen}
        onClose={onRequestClose}
        maxWidth="607px"
        dialogPanelClassName="!bg-transparent !shadow-none"
        contentClassName={DEPOSIT_TOKEN_MODAL_SHELL}
        ariaLabelledBy="deposit-token-modal-title"
        scrimClassName={DEPOSIT_SCRIM}
      >
        <div
          data-testid="deposit-token-modal"
          className="flex w-full flex-col gap-8"
        >
          <div className="flex flex-col gap-1">
            <p
              id="deposit-token-modal-title"
              className="text-2xl font-semibold leading-9 tracking-[-0.72px] text-text-primary dark:text-white"
            >
              {copy.tokenModalTitle(token)}
            </p>
            <p className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
              {copy.tokenModalSubtitle(token)}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3">
            <DepositBeforeYouContinue
              acknowledged={acknowledged}
              onAcknowledge={setAcknowledged}
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
        </div>
      </AnimatedModal>

      <DepositPickerModal
        isOpen={formOpen && picker === "network"}
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
        layout="compact"
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

export function DepositTokenModal(props: DepositTokenModalProps) {
  const sessionGetDepositAddress = useGetDepositAddress();
  const themeIsDark = useActualTheme();
  return (
    <DepositTokenModalView
      {...props}
      getDepositAddress={props.getDepositAddress ?? sessionGetDepositAddress}
      isDark={props.isDark ?? themeIsDark}
    />
  );
}
