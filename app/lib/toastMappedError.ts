"use client";

import { toast } from "sonner";

import {
  ERROR_MESSAGES,
  isSuppressed,
  mapToUserMessage,
} from "./errorMessages";
import { reportClientError } from "./sentry.client";

type MapReportActOptions = {
  feature: string;
};

/**
 * Map error → user message, send the **original** error to GlitchTip via
 * `captureException` (stack + real details), with `userFacingMessage` in `extra` only.
 * Skips reporting for suppressed (e.g. Hotjar) and user-rejected txs.
 */
export function mapReportAndAct(
  error: unknown,
  options: MapReportActOptions & {
    onUserMessage: (userMsg: string) => void;
  },
): void {
  const userMsg = mapToUserMessage(error);
  if (isSuppressed(userMsg)) return;

  if (userMsg !== ERROR_MESSAGES.USER_REJECTED) {
    reportClientError(error, {
      feature: options.feature,
      userFacingMessage: userMsg,
    });
  }

  options.onUserMessage(userMsg);
}

type ToastMappedOptions = MapReportActOptions & {
  /** If set, toast title is this and mapped message becomes the description (unless `description` overrides). */
  title?: string;
  description?: string;
};

/**
 * Same as mapReportAndAct but shows a Sonner toast. Prefer this wherever you had
 * `mapToUserMessage` + `toast.error`.
 */
export function toastMappedError(
  error: unknown,
  options: ToastMappedOptions,
): void {
  mapReportAndAct(error, {
    feature: options.feature,
    onUserMessage: (userMsg) => {
      if (options.title) {
        toast.error(options.title, {
          description: options.description ?? userMsg,
        });
        return;
      }
      toast.error(options.description ?? userMsg);
    },
  });
}
