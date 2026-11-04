"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';

function isVisibleFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute("disabled")) {
    return false;
  }
  if (el.getAttribute("aria-hidden") === "true") {
    return false;
  }
  if (el.hidden) {
    return false;
  }
  const tabIndex = el.tabIndex;
  if (tabIndex < 0) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") {
    return false;
  }
  return true;
}

import { ACTION_DRAWER_PANEL_ATTR } from "./walletDrawerSlot";

function getFocusables(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisibleFocusable);
}

function hasOpenCenteredModalDialog(drawerPanel: HTMLElement | null) {
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]',
  );
  for (const dialog of dialogs) {
    if (dialog.hasAttribute(ACTION_DRAWER_PANEL_ATTR)) {
      continue;
    }
    if (drawerPanel && drawerPanel === dialog) {
      continue;
    }
    return true;
  }
  return false;
}

/** Move focus into the drawer on open; restore trigger on close. */
export function useDrawerOpenFocus(
  container: HTMLElement | null,
  isActive: boolean,
  options?: { restoreFocusOnClose?: boolean },
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const restoreFocusOnClose = options?.restoreFocusOnClose ?? true;

  useLayoutEffect(() => {
    if (!isActive || !container) {
      return;
    }
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const nodes = getFocusables(container);
    const first = nodes[0];
    first?.focus({ focusVisible: false } as FocusOptions);

    return () => {
      if (restoreFocusOnClose) {
        previouslyFocused.current?.focus?.({ focusVisible: false } as FocusOptions);
      }
    };
  }, [container, isActive, restoreFocusOnClose]);
}

/** Keep Tab focus inside the drawer (mobile modal sheet). */
export function useDrawerFocusTrap(
  container: HTMLElement | null,
  isActive: boolean,
) {
  useEffect(() => {
    if (!isActive || !container) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const focusables = getFocusables(container);
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [container, isActive]);
}

export function useDrawerEscape(
  container: HTMLElement | null,
  onClose: () => void,
  isActive: boolean,
) {
  useLayoutEffect(() => {
    if (!isActive || !container) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      if (hasOpenCenteredModalDialog(container)) {
        return;
      }

      const focusInside =
        document.activeElement instanceof HTMLElement &&
        container.contains(document.activeElement);

      if (!focusInside) {
        return;
      }

      event.preventDefault();
      onClose();
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [container, isActive, onClose]);
}

export function usePendingActionClose({
  isActionPending,
  onContinueTrackingInBackground,
  onDrawerClosed,
}: {
  isActionPending: boolean;
  onContinueTrackingInBackground: () => void;
  onDrawerClosed: () => void;
}) {
  const requestClose = useCallback(() => {
    if (isActionPending) {
      onContinueTrackingInBackground();
    }
    onDrawerClosed();
  }, [
    isActionPending,
    onContinueTrackingInBackground,
    onDrawerClosed,
  ]);

  return { requestClose };
}
