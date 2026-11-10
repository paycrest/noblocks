"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { useAppUpdateBlock } from "../context/AppUpdateBlockContext";
import { useStep } from "../context/StepContext";

const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const APP_UPDATE_TOAST_ID = "app-update";
const DISMISSED_BUILD_ID_STORAGE_KEY = "app-update-dismissed-build-id";

function getClientBuildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID?.trim() ?? "";
}

/** Returns the server build id the user dismissed, if any (session-scoped). */
function getDismissedServerBuildId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(DISMISSED_BUILD_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers a dismissed server build so the same deploy is not nagged again. */
function setDismissedServerBuildId(buildId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(DISMISSED_BUILD_ID_STORAGE_KEY, buildId);
  } catch {
    // Quota/private mode — best-effort only.
  }
}

/** True when the user already dismissed the prompt for this server build. */
function isDismissedServerBuild(buildId: string): boolean {
  return getDismissedServerBuildId() === buildId;
}

/**
 * Polls `/api/version` and prompts the user to refresh when a new deploy is
 * live. Never reloads automatically — only via the toast action.
 */
export function useAppUpdatePrompt() {
  const { isFormStep } = useStep();
  const { isSensitiveFlowActive } = useAppUpdateBlock();
  const clientBuildId = getClientBuildId();
  const updatePendingRef = useRef(false);
  const pendingServerBuildIdRef = useRef<string | null>(null);
  const serverBuildIdRef = useRef<string | null>(null);
  const toastShownRef = useRef(false);
  const isFormStepRef = useRef(isFormStep);
  const isSensitiveFlowActiveRef = useRef(isSensitiveFlowActive);

  const canPromptUser = isFormStep && !isSensitiveFlowActive;

  useEffect(() => {
    isFormStepRef.current = isFormStep;
  }, [isFormStep]);

  useEffect(() => {
    isSensitiveFlowActiveRef.current = isSensitiveFlowActive;
  }, [isSensitiveFlowActive]);

  const handleToastClosed = useCallback(() => {
    toastShownRef.current = false;
    updatePendingRef.current = false;
    const dismissedId = serverBuildIdRef.current;
    if (dismissedId) {
      setDismissedServerBuildId(dismissedId);
    }
  }, []);

  const showUpdateToast = useCallback((serverBuildId: string) => {
    if (toastShownRef.current) return;
    if (isDismissedServerBuild(serverBuildId)) return;
    serverBuildIdRef.current = serverBuildId;
    toastShownRef.current = true;
    toast("New version available", {
      id: APP_UPDATE_TOAST_ID,
      duration: Infinity,
      closeButton: true,
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
    if (!updatePendingRef.current || !canPromptUser) return;
    const pendingBuildId = pendingServerBuildIdRef.current;
    if (!pendingBuildId || isDismissedServerBuild(pendingBuildId)) {
      updatePendingRef.current = false;
      pendingServerBuildIdRef.current = null;
      return;
    }
    updatePendingRef.current = false;
    pendingServerBuildIdRef.current = null;
    showUpdateToast(pendingBuildId);
  }, [canPromptUser, showUpdateToast]);

  const checkForUpdate = useCallback(async () => {
    if (!clientBuildId) return;
    try {
      const response = await fetch("/api/version", { cache: "no-store" });
      if (!response.ok) return;
      const data: { buildId?: string } = await response.json();
      if (!data.buildId || data.buildId === clientBuildId) return;
      if (isDismissedServerBuild(data.buildId)) return;

      pendingServerBuildIdRef.current = data.buildId;

      const safeToPrompt =
        isFormStepRef.current && !isSensitiveFlowActiveRef.current;
      if (safeToPrompt) {
        showUpdateToast(data.buildId);
      } else {
        updatePendingRef.current = true;
      }
    } catch {
      // Ignore transient network errors; the next interval or visibility tick retries.
    }
  }, [clientBuildId, showUpdateToast]);

  useEffect(() => {
    if (!canPromptUser && toastShownRef.current) {
      toast.dismiss(APP_UPDATE_TOAST_ID);
      toastShownRef.current = false;
      updatePendingRef.current = true;
    }
    maybeShowPending();
  }, [canPromptUser, maybeShowPending]);

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
