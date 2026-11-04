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

export function useDrawerFocusTrap(
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
      return Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isVisibleFocusable);
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
      previouslyFocused.current?.focus?.();
    };
  }, [containerRef, isActive]);
}

export function useDrawerEscape(
  containerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  isActive: boolean,
) {
  useLayoutEffect(() => {
    if (!isActive) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
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
