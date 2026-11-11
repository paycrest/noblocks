"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  useLinkAccount,
  useMfaEnrollment,
  usePrivy,
} from "@privy-io/react-auth";
import { DialogTitle } from "@headlessui/react";
import { CheckmarkBadge02Icon, SecurityCheckIcon, StudentCardIcon } from "hugeicons-react";
import { useInjectedWallet } from "../../context";
import { useHandleExportEmbeddedWallet } from "../../hooks/useHandleExportEmbeddedWallet";
import { ThemeSwitch } from "../../components/ThemeSwitch";
import { AnimatedModal } from "../../components/AnimatedComponents";
import { primaryBtnClasses, secondaryBtnClasses } from "../../components/Styles";
import { classNames } from "../../utils";

interface TransactionProtectionModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onNotNow: () => void;
}

/**
 * Figma "Transaction protection" intro (settings-mfa-intro): shown the first time a
 * user opens Enable MFA, before handing off to Privy's own enrollment modal.
 */
function TransactionProtectionModal({
  isOpen,
  onContinue,
  onNotNow,
}: TransactionProtectionModalProps) {
  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onNotNow}
      maxWidth="401px"
      contentRadiusClass="max-sm:rounded-t-[20px] sm:rounded-[20px]"
      contentClassName="border-[0.3px] border-border-light dark:border-white/10"
      ariaLabelledBy="transaction-protection-title"
    >
      <div className="flex flex-col items-center gap-[25px]">
        <div className="flex w-full flex-col items-center gap-4 px-[5px] py-[17px] text-center">
          <SecurityCheckIcon className="size-10 text-outline-gray dark:text-white/50" />
          <DialogTitle
            id="transaction-protection-title"
            className="font-sans text-2xl font-bold leading-9 text-neutral-900 dark:text-white"
          >
            Transaction protection
          </DialogTitle>
          <p className="text-sm tracking-[-0.14px] text-text-body dark:text-white/80">
            Set up transaction protection to add an extra layer of security to your
            account.
          </p>

          <div className="flex w-full flex-col gap-[10px] rounded-xl bg-[#fef9e8] p-3 text-left dark:bg-[#373737]">
            <div className="flex items-start gap-2.5">
              <CheckmarkBadge02Icon className="mt-0.5 size-4 shrink-0 text-outline-gray dark:text-white/50" />
              <p className="text-sm text-text-secondary dark:text-white/60">
                Enable two-step verification for your Noblocks wallet.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <StudentCardIcon className="mt-0.5 size-4 shrink-0 text-text-secondary dark:text-white/50" />
              <p className="text-sm text-text-secondary dark:text-white/60">
                You&apos;ll be prompted to authenticate to complete transactions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full gap-[15px]">
          <button
            type="button"
            onClick={onContinue}
            className={`${primaryBtnClasses} flex-1 font-general-sans`}
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onNotNow}
            className={`${secondaryBtnClasses} flex-1 font-general-sans`}
          >
            Not now
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}

function SettingsRow({
  title,
  children,
  className,
  padding = "p-4",
}: {
  title: string;
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={classNames(
        "flex min-h-14 items-center justify-between gap-4 rounded-[20px] bg-white dark:bg-[#2b2b2b]",
        padding,
        className ?? "",
      )}
    >
      <p className="shrink-0 whitespace-nowrap font-sans text-base font-semibold text-neutral-900 dark:text-white">
        {title}
      </p>
      {children}
    </div>
  );
}

const rowActionClasses =
  "shrink-0 text-sm font-medium text-lavender-500 hover:underline dark:text-lavender-400";

export function SettingsPageContent() {
  const { user, updateEmail } = usePrivy();
  const { isInjectedWallet } = useInjectedWallet();
  const handleExportEmbeddedWallet = useHandleExportEmbeddedWallet();
  const { showMfaEnrollmentModal } = useMfaEnrollment();
  const [showProtectionIntro, setShowProtectionIntro] = useState(false);

  const { linkEmail } = useLinkAccount({
    onSuccess: ({ user }) => {
      toast.success(`${user.email?.address} linked successfully`);
    },
    onError: (error) => {
      // Privy reports why linking failed — surface the real reason instead of
      // blanket-claiming the email is already linked.
      const code = String(error);
      if (code === "exited_link_flow") return; // user closed the modal — not an error
      toast.error("Error linking account", {
        description:
          code === "linked_to_another_user"
            ? "This email is already linked to another account"
            : "Couldn't link your email. Please try again.",
      });
    },
  });

  const isMfaEnrolled = !!user?.mfaMethods?.length;

  return (
    <div className="mx-auto w-full max-w-[643px] pt-[23px]">
      <h1 className="font-sans text-2xl font-semibold leading-6 text-neutral-900 dark:text-white">
        Settings
      </h1>

      <div className="mt-[37px] flex flex-col gap-5">
        {!isInjectedWallet && (
          <SettingsRow title="Export wallet">
            <button
              type="button"
              onClick={() => void handleExportEmbeddedWallet()}
              className={rowActionClasses}
            >
              Export
            </button>
          </SettingsRow>
        )}

        {!isInjectedWallet && (
          <SettingsRow title={isMfaEnrolled ? "Manage MFA" : "Enable MFA"}>
            <button
              type="button"
              onClick={() =>
                isMfaEnrolled
                  ? showMfaEnrollmentModal()
                  : setShowProtectionIntro(true)
              }
              className={rowActionClasses}
            >
              {isMfaEnrolled ? "Manage" : "Enable"}
            </button>
          </SettingsRow>
        )}

        <SettingsRow title="Theme" padding="pl-4 pr-2 py-[9px]">
          <ThemeSwitch />
        </SettingsRow>

        {!isInjectedWallet && (
          <SettingsRow title="Linked email address">
            {user?.email ? (
              <div className="flex min-w-0 items-center gap-[5px]">
                <span className="min-w-0 max-w-56 truncate text-sm font-medium text-text-body dark:text-white/70">
                  {user.email.address}
                </span>
                <button
                  type="button"
                  onClick={updateEmail}
                  className={rowActionClasses}
                >
                  Update
                </button>
              </div>
            ) : (
              <button type="button" onClick={linkEmail} className={rowActionClasses}>
                Connect
              </button>
            )}
          </SettingsRow>
        )}
      </div>

      <TransactionProtectionModal
        isOpen={showProtectionIntro}
        onContinue={() => {
          setShowProtectionIntro(false);
          showMfaEnrollmentModal();
        }}
        onNotNow={() => setShowProtectionIntro(false)}
      />
    </div>
  );
}
