"use client";

import type { ReactNode } from "react";

export type ActionDrawerTitle = "Buy" | "Sell" | "Swap" | string;

export type ReceiptRow = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
};

export type ReviewDetailRow = {
  label: string;
  value: string;
  copyValue?: string;
};

export type ActionProgressStepState = "pending" | "active" | "done" | "failed";

export type ActionProgressStep = {
  id: string;
  label: string;
  state: ActionProgressStepState;
};

export type PendingActionCloseHandlers = {
  /** Close UI while backend work continues (History + toast on completion). */
  onContinueTrackingInBackground: () => void;
  onDrawerClosed: () => void;
};

export type ActionSubmitHandler = () => Promise<void>;
