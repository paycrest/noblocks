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

/** Focus trap for centred modals only. */
export function useModalFocusTrap(
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
    const focusables = () => {
      if (!container) {
        return [];
      }
      return getFocusables(container);
    };

    const first = focusables()[0];
    first?.focus({ focusVisible: false } as FocusOptions);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const nodes = focusables();
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus({ focusVisible: false } as FocusOptions);
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus({ focusVisible: false } as FocusOptions);
      }
    };

    container?.addEventListener("keydown", onKeyDown, true);
    return () => {
      container?.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus?.({ focusVisible: false } as FocusOptions);
    };
  }, [containerRef, isActive]);
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

export function useDrawerEscape(onClose: () => void, isActive: boolean) {
  useEffect(() => {
    if (!isActive) {
      return;
    }

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
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isActive, onClose]);
}

/** @deprecated Use useModalFocusTrap for modals; drawer is non-modal. */
export const useDrawerFocusTrap = useModalFocusTrap;

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
