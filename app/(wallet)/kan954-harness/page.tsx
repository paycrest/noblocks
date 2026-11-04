"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

import { classNames } from "@/app/utils";

import {
  ActionDrawer,
  ActionProgress,
  ActionReceiptFailed,
  ActionReceiptSuccess,
  ActionSubmitButton,
  DrawerReviewStep,
  ReviewModal,
  showActionSuccessToast,
} from "@/app/components/drawer";
import { drawerEmphasisText } from "@/app/components/drawer/drawerStyles";

const VALID_EVM_HASH =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

function CoinIcon({ label }: { label: string }) {
  return (
    <span
      className="flex size-3.5 items-center justify-center rounded-full bg-lavender-500 text-[8px] font-bold text-white"
      aria-hidden
    >
      {label.slice(0, 1)}
    </span>
  );
}

function PageChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="mb-6 text-sm text-text-secondary dark:text-white/50">
        Main app content (undimmed)
      </p>
      {children}
    </>
  );
}

function DrawerHarness({
  title,
  bodyAlign,
  children,
}: {
  title: "Buy" | "Sell" | "Swap";
  bodyAlign?: "center" | "start";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-testid="open-drawer"
        className="ml-8 rounded-lg bg-lavender-500 px-4 py-2 text-sm font-medium text-white"
        onClick={() => setOpen(true)}
      >
        Open drawer
      </button>
      <ActionDrawer
        isOpen={open}
        title={title}
        onRequestClose={() => setOpen(false)}
        bodyAlign={bodyAlign}
      >
        {children}
      </ActionDrawer>
    </>
  );
}

function SceneContent({ scene }: { scene: string }) {
  const reviewRows = useMemo(
    () => [
      {
        label: "Provider",
        value: "Providus Bank (4Bay7 Enterprise)",
      },
      {
        label: "Account number",
        value: "952157815",
        copyValue: "952157815",
      },
      {
        label: "Amount",
        value: "NGN 19,000",
        copyValue: "19000",
      },
    ],
    [],
  );

  if (scene === "filled") {
    return (
      <PageChrome>
        <DrawerHarness title="Buy">
          <div className="flex w-full flex-col gap-4">
            <div className="rounded-3xl bg-background-neutral p-2 dark:bg-white/[0.05]">
              <div className="rounded-2xl bg-white p-4 dark:bg-[#141414]">
                <p className="text-sm text-text-secondary dark:text-white/50">You pay</p>
                <p className="text-2xl font-medium text-text-body dark:text-white/80">14.3 USDT</p>
              </div>
            </div>
            <ActionSubmitButton label="Buy" disabled onClick={() => {}} />
          </div>
        </DrawerHarness>
      </PageChrome>
    );
  }

  if (scene === "review") {
    return (
      <PageChrome>
        <DrawerHarness title="Buy">
          <DrawerReviewStep
            heading="Make payment"
            subheading={
              <>
                Send NGN{" "}
                <span className={drawerEmphasisText}>19,000</span>
                {" to the account below"}
              </>
            }
            detailRows={reviewRows}
            expiresInSeconds={1783}
            confirmationLabel="I sent exactly ₦19,000 from my own bank account to the account above."
            confirmationChecked
            onConfirmationChange={() => {}}
            submitLabel="I have sent the money"
            onSubmit={() => {}}
          />
        </DrawerHarness>
      </PageChrome>
    );
  }

  if (scene === "progress1") {
    return (
      <PageChrome>
        <DrawerHarness title="Buy">
          <ActionProgress
            heading="Watching for your transfer"
            subheading="Transfers usually arrive within a few minutes."
            steps={[
              {
                id: "wait",
                label: "Waiting for your transfer",
                state: "active",
              },
              {
                id: "received",
                label: "Payment received",
                state: "pending",
              },
              {
                id: "adding",
                label: "Adding 14.3 USDT to your balance",
                state: "pending",
              },
            ]}
          />
        </DrawerHarness>
      </PageChrome>
    );
  }

  if (scene === "progress3") {
    return (
      <PageChrome>
        <DrawerHarness title="Buy">
          <ActionProgress
            heading="Watching for your transfer"
            subheading="Transfers usually arrive within a few minutes."
            steps={[
              {
                id: "wait",
                label: "Waiting for your transfer",
                state: "done",
              },
              {
                id: "received",
                label: "Payment received",
                state: "done",
              },
              {
                id: "adding",
                label: "Adding 14.3 USDT to your balance",
                state: "active",
              },
            ]}
          />
        </DrawerHarness>
      </PageChrome>
    );
  }

  if (scene === "receipt-success") {
    return (
      <PageChrome>
        <DrawerHarness title="Buy">
          <ActionReceiptSuccess
            variant="drawer"
            title="USDT 14.3 added"
            subtitle="Your money is in your balance and ready to use."
            fundStatusLabel="Transferred"
            timeSpentLabel="12 seconds"
            networkName="BNB Smart Chain"
            txHash={VALID_EVM_HASH}
            primaryActionLabel="Earn"
            onPrimaryAction={() => {}}
            onSecondaryAction={() => {}}
          />
        </DrawerHarness>
      </PageChrome>
    );
  }

  if (scene === "receipt-failed") {
    return (
      <PageChrome>
        <DrawerHarness title="Sell" bodyAlign="start">
          <ActionReceiptFailed
            variant="drawer"
            body={
              <>
                Your transfer of{" "}
                <span className={drawerEmphasisText}>
                  20.4 USDT (Ksh 369,723.88)
                </span>{" "}
                to Chukwuemeka David Okafor was unsuccessful.
              </>
            }
            failureReasonBody="The provider went on a coffee break mid-transfer. Your tokens are safe and will boomerang back shortly."
            fundStatusLabel="Deposited"
            timeSpentLabel="12 seconds"
            networkName="Base"
            txHash={VALID_EVM_HASH}
            onRetry={() => {}}
          />
        </DrawerHarness>
      </PageChrome>
    );
  }

  if (scene === "review-modal") {
    return (
      <PageChrome>
        <ReviewModal
          isOpen
          onClose={() => {}}
          from={{
            symbol: "USDC",
            amountLabel: "100 USDC",
            icon: <CoinIcon label="U" />,
          }}
          to={{
            symbol: "USDT",
            amountLabel: "99.8 USDT",
            icon: <CoinIcon label="T" />,
          }}
          youPayLabel="100 USDC"
          youPayIcon={<CoinIcon label="U" />}
          feesLabel="0.2 USDC"
          warningText="Swaps cannot be reversed once submitted. Confirm the amounts before continuing."
          onSubmit={() => {}}
        />
      </PageChrome>
    );
  }

  if (scene === "receipt-modal") {
    return (
      <PageChrome>
        <ActionReceiptSuccess
          variant="modal"
          isOpen
          onClose={() => {}}
          title="Swap successful"
          fundStatusLabel="Swapped"
          timeSpentLabel="12 seconds"
          networkName="Base"
          txHash={VALID_EVM_HASH}
          tokenPair={
            <div className={classNames("flex items-center gap-2 text-sm", drawerEmphasisText)}>
              <CoinIcon label="U" />
              <span>100 USDC</span>
              <span className="text-text-secondary dark:text-white/50">→</span>
              <CoinIcon label="T" />
              <span>99.8 USDT</span>
            </div>
          }
        />
      </PageChrome>
    );
  }

  if (scene === "toast") {
    return (
      <PageChrome>
        <ToastScene />
      </PageChrome>
    );
  }

  return (
    <PageChrome>
      <p className="p-8 text-white/50">Unknown scene</p>
    </PageChrome>
  );
}

function ToastScene() {
  useEffect(() => {
    showActionSuccessToast(
      "14.3 USDT added",
      "Funds have been added to your balance.",
    );
  }, []);
  return null;
}

function HarnessInner() {
  const params = useSearchParams();
  const scene = params.get("scene") ?? "review";
  const theme = params.get("theme") === "light" ? "light" : "dark";

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    } else {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    }
  }, [theme]);

  return <SceneContent scene={scene} />;
}

export default function Kan954HarnessPage() {
  return (
    <Suspense fallback={null}>
      <HarnessInner />
    </Suspense>
  );
}
