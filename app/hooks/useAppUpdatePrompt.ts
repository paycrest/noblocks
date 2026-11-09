"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { useStep } from "../context/StepContext";

const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const APP_UPDATE_TOAST_ID = "app-update";

function getClientBuildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID?.trim() ?? "";
}

/**
 * Polls `/api/version` and prompts the user to refresh when a new deploy is
 * live. Never reloads automatically — only via the toast action.
 */
export function useAppUpdatePrompt() {
  const { isFormStep } = useStep();
  const clientBuildId = getClientBuildId();
  const updatePendingRef = useRef(false);
  const toastShownRef = useRef(false);
  const isFormStepRef = useRef(isFormStep);

  useEffect(() => {
    isFormStepRef.current = isFormStep;
  }, [isFormStep]);

  const handleToastClosed = useCallback(() => {
    toastShownRef.current = false;
    updatePendingRef.current = true;
  }, []);

  const showUpdateToast = useCallback(() => {
    if (toastShownRef.current) return;
    toastShownRef.current = true;
    toast("New version available", {
      id: APP_UPDATE_TOAST_ID,
      duration: Infinity,
      onDismiss: handleToastClosed,
      onAutoClose: handleToastClosed,
      action: {
        label: "Refresh",
        onClick: () => {
          window.location.reload();
        },
      },
    });
  }, [handleToastClosed]);

  const maybeShowPending = useCallback(() => {
    if (!updatePendingRef.current || !isFormStep) return;
    updatePendingRef.current = false;
    showUpdateToast();
  }, [isFormStep, showUpdateToast]);

  const checkForUpdate = useCallback(async () => {
    if (!clientBuildId) return;
    try {
      const response = await fetch("/api/version", { cache: "no-store" });
      if (!response.ok) return;
      const data: { buildId?: string } = await response.json();
      if (!data.buildId || data.buildId === clientBuildId) return;

      if (isFormStepRef.current) {
        showUpdateToast();
      } else {
        updatePendingRef.current = true;
      }
    } catch {
      // Ignore transient network errors; the next interval or visibility tick retries.
    }
  }, [clientBuildId, showUpdateToast]);

  useEffect(() => {
    if (!isFormStep && toastShownRef.current) {
      toast.dismiss(APP_UPDATE_TOAST_ID);
      toastShownRef.current = false;
      updatePendingRef.current = true;
    }
    maybeShowPending();
  }, [isFormStep, maybeShowPending]);

  useEffect(() => {
    void checkForUpdate();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(
      () => void checkForUpdate(),
      VERSION_CHECK_INTERVAL_MS,
    );

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);
    };
  }, [checkForUpdate]);
}
