import type { V2FiatProviderAccountDTO } from "../types";

/** Display shape for virtual account / bank transfer instructions (shared by MakePayment & TransactionDetails). */
export type OnrampPaymentInstructions = {
  provider: string;
  accountNumber: string;
  amount: number;
  currency: string;
  expiresAt: Date;
};

export function mapProviderAccountToInstructions(
  a: V2FiatProviderAccountDTO,
  fallbackCurrency: string,
  fallbackAmount: number,
): OnrampPaymentInstructions {
  const raw = a.amountToTransfer?.replace(/,/g, "") ?? "";
  const parsed = raw ? parseFloat(raw) : fallbackAmount;
  return {
    provider:
      a.institution && a.accountName
        ? `${a.institution} | ${a.accountName}`
        : a.institution || a.accountName,
    accountNumber: a.accountIdentifier,
    amount: Number.isFinite(parsed) ? parsed : fallbackAmount,
    currency: a.currency || fallbackCurrency,
    expiresAt: new Date(a.validUntil),
  };
}
