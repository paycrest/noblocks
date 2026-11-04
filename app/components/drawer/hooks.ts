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

function getFocusables(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisibleFocusable);
}

function hasOpenModalDialog() {
  return (
    document.querySelector('[role="dialog"][aria-modal="true"]') !== null
  );
}

/** Move focus into the drawer on open; restore trigger on close (non-modal drawer). */
export function useDrawerOpenFocus(
  containerRef: React.RefObject<HTMLElement | null>,
  isActive: boolean,
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!isActive) {
      return;
    }
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const container = containerRef.current;
    const nodes = container ? getFocusables(container) : [];
    const first = nodes[0];
    first?.focus({ focusVisible: false } as FocusOptions);

    return () => {
      previouslyFocused.current?.focus?.({ focusVisible: false } as FocusOptions);
    };
  }, [containerRef, isActive]);
}

export function useDrawerEscape(
  containerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  isActive: boolean,
) {
  const lastInteractionInsideRef = useRef(false);

  useEffect(() => {
    if (!isActive) {
      lastInteractionInsideRef.current = false;
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const markInteractionInside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && container.contains(target)) {
        lastInteractionInsideRef.current = true;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      if (hasOpenModalDialog()) {
        return;
      }

      const focusInside =
        document.activeElement instanceof HTMLElement &&
        container.contains(document.activeElement);

      if (!focusInside && !lastInteractionInsideRef.current) {
        return;
      }

      event.preventDefault();
      onClose();
    };

    container.addEventListener("pointerdown", markInteractionInside);
    container.addEventListener("focusin", markInteractionInside);
    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("pointerdown", markInteractionInside);
      container.removeEventListener("focusin", markInteractionInside);
      container.removeEventListener("keydown", onKeyDown);
    };
  }, [containerRef, isActive, onClose]);
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
