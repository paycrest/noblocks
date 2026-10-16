"use client";
import { useState } from "react";
import axios from "axios";
import { DialogTitle } from "@headlessui/react";
import { ImSpinner } from "react-icons/im";
import { InformationSquareIcon } from "hugeicons-react";
import { classNames } from "../utils";
import { primaryBtnClasses, secondaryBtnClasses } from "./Styles";
import { submitOnrampIdentityCheck } from "../api/aggregator";
import { useApiAuth } from "../hooks/useApiAuth";
import { onrampOrderErrorMessage } from "../lib/errorMessages";

export type OnrampIdentityPrompt = {
  /** What the server said is needed, in one sentence. */
  message: string;
  /** Whether a BVN or NIN check can supply it, without verifying again. */
  quickVerify: boolean;
  /** The user is not ID-verified at all: send them to identity verification. */
  needsIdVerification: boolean;
};

/**
 * Shown when an on-ramp order is refused for missing customer KYC. Asks for the BVN or NIN when
 * that is all that is missing, otherwise explains what to do.
 */
export const OnrampIdentityModal = ({
  prompt,
  onClose,
  onVerified,
  onVerifyIdentity,
}: {
  prompt: OnrampIdentityPrompt;
  onClose: () => void;
  onVerified: () => void;
  onVerifyIdentity: () => void;
}) => {
  const { resolveAuth } = useApiAuth();
  const [idType, setIdType] = useState<"BVN" | "NIN">("BVN");
  const [idNumber, setIdNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\d{11}$/.test(idNumber);

  const submit = async () => {
    if (!valid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { accessToken, injectedToken } = await resolveAuth({ interactive: true });
      await submitOnrampIdentityCheck(idType, idNumber, accessToken, injectedToken);
      onVerified();
    } catch (e) {
      setError(
        (axios.isAxiosError(e) && onrampOrderErrorMessage(e.response?.data)) ||
          "We couldn't confirm your details. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 text-start">
        <InformationSquareIcon className="h-[22.17px] w-[22.17px] text-gray-400 dark:text-white/40" />
        <DialogTitle className="text-lg text-text-body dark:text-white">
          {prompt.quickVerify
            ? "Confirm your identity"
            : prompt.needsIdVerification
              ? "Verification needed"
              : "You can't buy yet"}
        </DialogTitle>
        <p className="text-sm font-light text-text-secondary dark:text-white/50">{prompt.message}</p>
      </div>

      {prompt.quickVerify && (
        <div className="space-y-4">
          <div className="flex gap-2" role="radiogroup" aria-label="ID number type">
            {(["BVN", "NIN"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={idType === t}
                onClick={() => setIdType(t)}
                className={classNames(
                  "flex-1 rounded-xl border px-4 py-2 text-sm transition-colors",
                  idType === t
                    ? "border-lavender-500 text-lavender-500"
                    : "border-border-input text-text-secondary dark:border-white/20 dark:text-white/50",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <label htmlFor="onramp-id-number" className="text-sm font-medium text-text-secondary dark:text-white/70">
              Your {idType}
            </label>
            <input
              id="onramp-id-number"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              placeholder="11 digits"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="min-h-12 w-full rounded-xl border border-border-input bg-transparent px-4 py-3 text-sm text-neutral-900 transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none dark:border-white/20 dark:bg-black2 dark:text-white/80 dark:placeholder:text-white/30 dark:focus-within:border-white/40"
            />
            <p className="text-xs text-text-secondary dark:text-white/50">
              We check it with your bank or NIMC record. It must be your own.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onClose} className={classNames(secondaryBtnClasses)} disabled={isSubmitting}>
          {prompt.quickVerify || prompt.needsIdVerification ? "Cancel" : "Close"}
        </button>
        {prompt.quickVerify && (
          <button
            type="button"
            onClick={submit}
            disabled={!valid || isSubmitting}
            className={classNames(primaryBtnClasses, "w-full")}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <ImSpinner className="animate-spin text-lg" />
                Checking...
              </span>
            ) : (
              "Confirm and buy"
            )}
          </button>
        )}
        {!prompt.quickVerify && prompt.needsIdVerification && (
          <button type="button" onClick={onVerifyIdentity} className={classNames(primaryBtnClasses, "w-full")}>
            Verify identity
          </button>
        )}
      </div>
    </div>
  );
};
