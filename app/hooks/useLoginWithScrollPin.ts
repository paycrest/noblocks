"use client";
import { useCallback, useEffect, useRef } from "react";
import {
  acquireBodyScrollLock,
  releaseBodyScrollLock,
} from "../components/AnimatedComponents";

/** Privy's dialog root — verified against @privy-io/react-auth dist (id:"privy-dialog"). */
const PRIVY_DIALOG_ID = "privy-dialog";
/** If the dialog never mounts (e.g. instant OAuth redirect), unpin after this. */
const DIALOG_APPEAR_TIMEOUT_MS = 5000;

/**
 * Wraps Privy's login() so the document body stays pinned for the whole login
 * flow. Privy mounts companion iframes at the end of <body>; when one takes
 * focus on mobile the browser scrolls the document to the bottom behind the
 * (position: fixed) login dialog. AnimatedModal's lock can't cover this — the
 * displacement happens before any app modal exists — so the pin is acquired
 * here, before the dialog opens, and released when #privy-dialog leaves the
 * DOM (login success or dismissal). Uses the same refcounted body lock as
 * AnimatedModal, so a post-login modal taking its own lock keeps the body
 * pinned continuously with no visible jump.
 */
export function useLoginWithScrollPin(login: () => void): () => void {
  const holdsLockRef = useRef(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (holdsLockRef.current) {
      holdsLockRef.current = false;
      releaseBodyScrollLock();
    }
  }, []);

  // Unmount safety net — never leave the body pinned with no one to release it.
  useEffect(() => release, [release]);

  return useCallback(() => {
    if (typeof window !== "undefined" && !holdsLockRef.current) {
      holdsLockRef.current = true;
      acquireBodyScrollLock();

      let dialogSeen = false;
      const check = () => {
        if (document.getElementById(PRIVY_DIALOG_ID)) {
          dialogSeen = true;
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        } else if (dialogSeen) {
          release();
        }
      };
      observerRef.current = new MutationObserver(check);
      observerRef.current.observe(document.body, {
        childList: true,
        subtree: true,
      });
      timeoutRef.current = setTimeout(() => {
        if (!dialogSeen) release();
      }, DIALOG_APPEAR_TIMEOUT_MS);
    }
    login();
  }, [login, release]);
}
