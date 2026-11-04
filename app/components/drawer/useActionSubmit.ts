"use client";

import { useCallback, useRef, useState } from "react";

import { toastMappedError } from "@/app/lib/toastMappedError";

import type { ActionSubmitHandler } from "./types";

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
  const activeKeyRef = useRef<string | null>(null);

  const submit = useCallback(
    async (idempotencyKey: string, handler: ActionSubmitHandler) => {
      if (isSubmitting) {
        return;
      }
      if (activeKeyRef.current === idempotencyKey) {
        return;
      }
      activeKeyRef.current = idempotencyKey;
      setIsSubmitting(true);
      try {
        await handler();
      } catch (error) {
        toastMappedError(error, {
          feature: options.feature,
          title: options.errorTitle,
        });
      } finally {
        setIsSubmitting(false);
        activeKeyRef.current = null;
      }
    },
    [isSubmitting, options.errorTitle, options.feature],
  );

  return { isSubmitting, submit };
}
