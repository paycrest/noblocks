"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Wallet01Icon,
} from "hugeicons-react";
import { toast } from "sonner";
import { useBalance } from "../context";
import {
  useEarnAvailableTokens,
  useEarnHandler,
  type EarnToken,
} from "../hooks/useEarnHandler";
import { classNames } from "../utils";
import { FormDropdown } from "./FormDropdown";
import { primaryBtnClasses } from "./Styles";

const VOYAGER_TX_BASE = "https://voyager.online/tx/";

const TOKEN_DECIMALS = 6;
const TOKEN_FACTOR = BigInt("1000000");
// Vesu's pool APR fluctuates with utilization. Poll the markets API on this
// cadence so the displayed rate stays in sync with the live pool while the
// modal is open.
const APR_REFRESH_MS = 30_000;

type Tab = "deposit" | "withdraw";

function parseAmountToBaseUnits(input: string): bigint | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!/^\d*(\.\d{0,6})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const wholeBig = BigInt(whole || "0") * TOKEN_FACTOR;
  const fracPadded = (frac + "0".repeat(TOKEN_DECIMALS)).slice(0, TOKEN_DECIMALS);
  return wholeBig + BigInt(fracPadded || "0");
}

function formatBaseUnits(units: bigint, fractionDigits = 4): string {
  const negative = units < BigInt("0");
  const abs = negative ? -units : units;
  const whole = abs / TOKEN_FACTOR;
  const frac = abs % TOKEN_FACTOR;
  const fracStr = frac.toString().padStart(TOKEN_DECIMALS, "0").slice(0, fractionDigits);
  const trimmed = fracStr.replace(/0+$/, "");
  const out = trimmed ? `${whole}.${trimmed}` : whole.toString();
  return negative ? `-${out}` : out;
}

function formatPercent(decimal: number | null): string {
  if (decimal === null || !Number.isFinite(decimal)) return "";
  return `${(decimal * 100).toFixed(2)}%`;
}

export const EarnWalletForm: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const { allBalances, refreshBalance } = useBalance();
  const { positions, refreshPosition, deposit, withdraw } = useEarnHandler();
  const { tokens: availableEarnTokens } = useEarnAvailableTokens();

  const tokenDropdownItems = useMemo(
    () =>
      availableEarnTokens.map((t) => ({
        name: t,
        imageUrl: `/logos/${t.toLowerCase()}-logo.svg`,
      })),
    [availableEarnTokens],
  );

  const [tab, setTab] = useState<Tab>("deposit");
  const [token, setToken] = useState<EarnToken | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    type: Tab;
    token: EarnToken;
    amountFormatted: string;
    txHash: string;
  } | null>(null);

  const walletBalanceUnit: number = token
    ? ((allBalances.starknetWallet?.balances?.[token] as number | undefined) ??
      0)
    : 0;
  const walletBalanceBaseUnits: bigint = token
    ? (allBalances.starknetWallet?.balancesInWei?.[token] ?? BigInt("0"))
    : BigInt("0");

  const position = token ? positions[token] : null;
  const suppliedBaseUnits: bigint = useMemo(() => {
    if (!position) return BigInt("0");
    try {
      return BigInt(position.suppliedBaseUnits);
    } catch {
      return BigInt("0");
    }
  }, [position]);

  const apy = position?.supplyApy ?? null;

  const form = useForm<{ amount: string }>({ mode: "onChange" });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = form;

  const amountString = watch("amount") ?? "";
  const parsedAmount = useMemo(
    () => parseAmountToBaseUnits(amountString),
    [amountString],
  );

  // Live earnings projection on the entered amount
  const projection = useMemo(() => {
    if (!parsedAmount || !apy)
      return { yearly: BigInt("0"), monthly: BigInt("0") };
    const yearlyMicro = (parsedAmount * BigInt(Math.round(apy * 1_000_000))) /
      BigInt("1000000");
    const monthlyMicro = yearlyMicro / BigInt("12");
    return { yearly: yearlyMicro, monthly: monthlyMicro };
  }, [parsedAmount, apy]);

  // Poll the position (and embedded supply APR) while the modal is open so
  // the rate stays in sync with the live pool instead of the once-on-open value.
  useEffect(() => {
    if (!token) return;
    void refreshPosition(token);
    const id = window.setInterval(() => {
      void refreshPosition(token);
    }, APR_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshPosition, token]);

  // Reset the amount field when switching tabs OR tokens — different
  // sources/decimals/limits don't compose meaningfully.
  useEffect(() => {
    reset({ amount: "" });
  }, [tab, token, reset]);

  const sourceBaseUnits =
    tab === "deposit" ? walletBalanceBaseUnits : suppliedBaseUnits;

  const handleChip = (ratio: number) => {
    if (sourceBaseUnits <= BigInt("0")) return;
    const portion =
      ratio === 1
        ? sourceBaseUnits
        : (sourceBaseUnits * BigInt(Math.round(ratio * 10000))) / BigInt("10000");
    setValue("amount", formatBaseUnits(portion, TOKEN_DECIMALS), {
      shouldValidate: true,
    });
  };

  const validateAmount = (raw: string): string | true => {
    if (!token) return "Select a token first";
    const parsed = parseAmountToBaseUnits(raw);
    if (parsed === null) return "Enter a valid amount";
    if (parsed <= BigInt("0")) return "Amount must be greater than zero";
    if (parsed > sourceBaseUnits) {
      return tab === "deposit"
        ? `Amount exceeds your ${token} balance`
        : "Amount exceeds your supplied position";
    }
    return true;
  };

  const onSubmit = handleSubmit(async ({ amount }) => {
    if (!token) return;
    const parsed = parseAmountToBaseUnits(amount);
    if (!parsed || parsed <= BigInt("0")) return;

    setSubmitting(true);
    const toastId = toast.loading(
      tab === "deposit"
        ? `Depositing ${token} to Vesu pool…`
        : `Withdrawing ${token} from Vesu pool…`,
    );

    try {
      const useMax = tab === "withdraw" && parsed === suppliedBaseUnits;
      const result =
        tab === "deposit"
          ? await deposit(token, parsed)
          : await withdraw(token, useMax ? "max" : parsed);

      // Dismiss the loading toast — the inline success view replaces it,
      // mirroring TransferForm.tsx's renderSuccessView pattern.
      toast.dismiss(toastId);
      reset({ amount: "" });
      void Promise.all([refreshPosition(token), refreshBalance()]);
      setSuccessInfo({
        type: tab,
        token,
        amountFormatted: formatBaseUnits(parsed),
        txHash: result.txHash,
      });
    } catch (err: any) {
      toast.error(
        tab === "deposit" ? "Deposit failed" : "Withdraw failed",
        { id: toastId, description: err?.message },
      );
    } finally {
      setSubmitting(false);
    }
  });

  const renderSuccessView = () => {
    if (!successInfo) return null;
    const { type, token: succToken, amountFormatted, txHash } = successInfo;
    const explorerLink = txHash ? `${VOYAGER_TX_BASE}${txHash}` : undefined;
    const title = type === "deposit" ? "Deposit successful" : "Withdrawal successful";
    const description =
      type === "deposit"
        ? `${amountFormatted} ${succToken} has been successfully deposited into the Vesu pool.`
        : `${amountFormatted} ${succToken} has been successfully withdrawn from the Vesu pool.`;
    return (
      <div className="space-y-6 pt-4">
        <CheckmarkCircle01Icon className="mx-auto size-10" color="#39C65D" />
        <div className="space-y-3 pb-5 text-center">
          <h2 className="text-lg font-semibold text-text-body dark:text-white">
            {title}
          </h2>
          <p className="text-gray-500 dark:text-white/50">{description}</p>
          {explorerLink && (
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-center text-lavender-500 underline"
            >
              View in Explorer
            </a>
          )}
        </div>
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          onClick={() => {
            setSuccessInfo(null);
            onClose();
          }}
        >
          Close
        </button>
      </div>
    );
  };

  if (successInfo) {
    return renderSuccessView();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 bg-white dark:bg-surface-overlay">
        <div className="space-y-4 sm:flex-1">
          <h2 className="text-xl font-semibold text-text-body dark:text-white">
            Earn
          </h2>
          <p className="text-sm text-text-secondary dark:text-white/50">
            Supply USDC or USDT to a Vesu lending pool
          </p>
        </div>
        <button
          type="button"
          aria-label="Close earn modal"
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/10"
        >
          <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-accent-gray p-1 dark:bg-white/5">
        {(["deposit", "withdraw"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            disabled={submitting}
            className={classNames(
              "h-9 rounded-lg text-sm font-medium capitalize transition-all disabled:opacity-50",
              tab === t
                ? "bg-white text-text-body shadow-sm dark:bg-white/10 dark:text-white"
                : "text-text-secondary dark:text-white/60",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Amount field — mirrors TransferForm's amount box */}
      <div className="w-full max-w-full space-y-2">
        <div className="flex h-fit min-h-[94px] w-full flex-col gap-3 rounded-2xl border-[0.3px] border-border-input bg-transparent px-4 py-3 dark:border-white/20 dark:bg-black2">
          <div className="flex justify-between gap-1">
            <label
              htmlFor="earn-amount"
              className="text-sm font-medium text-text-secondary dark:text-white/70"
            >
              Amount
            </label>
            {token && (
              <div className="flex items-center gap-2">
                <Wallet01Icon
                  size={16}
                  className="text-icon-outline-secondary dark:text-white/50"
                />
                <span className="text-sm font-normal text-neutral-900 dark:text-white">
                  {`${formatBaseUnits(sourceBaseUnits)} ${token}`}
                </span>
                <button
                  type="button"
                  onClick={() => handleChip(1)}
                  className="text-sm font-medium text-lavender-500 transition-colors hover:text-lavender-600"
                >
                  Max
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <input
              id="earn-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              {...register("amount", {
                required: { value: true, message: "Amount is required" },
                disabled: !token || submitting,
                validate: validateAmount,
              })}
              className={classNames(
                "w-full bg-transparent text-3xl font-medium outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30",
                errors.amount
                  ? "text-red-500 dark:text-red-500"
                  : "text-text-body dark:text-white",
              )}
            />
            <FormDropdown
              defaultTitle="Select token"
              data={tokenDropdownItems}
              defaultSelectedItem={token ?? undefined}
              isCTA={true}
              onSelect={(name: string) => {
                const match = availableEarnTokens.find((t) => t === name);
                if (match) setToken(match);
              }}
              className="min-w-32"
              dropdownWidth={192}
            />
          </div>
        </div>

        {errors.amount && (
          <p className="text-xs text-red-500">{errors.amount.message}</p>
        )}
      </div>

      {/* Stats: APR / Monthly / Yearly — always visible. Labels stay so the
          modal's height is stable; values are blank until a token is selected.
          Each value cell uses a non-breaking space placeholder to preserve the
          row height when empty. */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-accent-gray p-3 text-center dark:bg-white/5">
        <div>
          <p className="text-xs text-text-secondary dark:text-white/50">APR</p>
          <p className="text-sm font-semibold text-text-body dark:text-white">
            {token ? formatPercent(apy) : " "}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary dark:text-white/50">
            Monthly est.
          </p>
          <p className="text-sm font-semibold text-text-body dark:text-white">
            {token ? `${formatBaseUnits(projection.monthly)} ${token}` : " "}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary dark:text-white/50">
            Yearly est.
          </p>
          <p className="text-sm font-semibold text-text-body dark:text-white">
            {token ? `${formatBaseUnits(projection.yearly)} ${token}` : " "}
          </p>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !token}
        className="min-h-11 w-full rounded-xl bg-lavender-500 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[0.99] hover:bg-lavender-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {tab === "deposit" ? "Starting…" : "Confirming…"}
          </span>
        ) : tab === "deposit" ? (
          "Start earning"
        ) : (
          "Confirm"
        )}
      </button>
    </form>
  );
};
