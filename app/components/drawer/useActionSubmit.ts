"use client";

import { useCallback, useRef, useState } from "react";

import { toastMappedError } from "@/app/lib/toastMappedError";

import type { ActionSubmitHandler, ActionSubmitResult } from "./types";

type UseActionSubmitOptions = {
  feature: string;
  errorTitle?: string;
};

/**
 * Disables the primary CTA for the duration of an async submit so double-clicks
 * cannot double-submit. Re-enables only after the handler settles.
 */
export function useActionSubmit(options: UseActionSubmitOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  const submit = useCallback(
    async (
      idempotencyKey: string,
      handler: ActionSubmitHandler,
    ): Promise<ActionSubmitResult> => {
      if (inFlightRef.current) {
        return { ok: false, error: new Error("submit_in_flight") };
      }
      inFlightRef.current = true;
      setIsSubmitting(true);
      try {
        await handler(idempotencyKey);
        return { ok: true };
      } catch (error) {
        toastMappedError(error, {
          feature: options.feature,
          title: options.errorTitle,
        });
        return { ok: false, error };
      } finally {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [options.errorTitle, options.feature],
  );

  return { isSubmitting, submit };
}
