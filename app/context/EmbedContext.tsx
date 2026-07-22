"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

/**
 * Embed (widget) mode context.
 *
 * Active on the /widget route, which partners iframe from whitelisted origins
 * (see middleware.ts). Exposes a postMessage channel to the host page:
 *   noblocks:ready   - widget mounted
 *   noblocks:resize  - { height } content height changed
 *   noblocks:close   - user clicked the widget close button
 *   noblocks:tx_status - { status, orderId } transaction progress
 *
 * The host origin is derived from document.referrer (the embedding page on an
 * iframe's first load). If the host strips its referrer entirely, events are
 * not sent — we never postMessage to "*" because payloads can include order
 * details. The wallet bridge (embed-bridge-provider.ts) shares parentOrigin.
 */

export const isEmbedPath = (pathname: string | null): boolean =>
  pathname === "/widget" || (pathname ?? "").startsWith("/widget/");

interface EmbedContextType {
  /** True when rendering the /widget embed route. */
  isEmbed: boolean;
  /** Origin of the embedding page, or null when unknown / not framed. */
  parentOrigin: string | null;
  /** Send an event to the host page. No-op outside an iframe. */
  postToHost: (event: string, payload?: unknown) => void;
}

const EmbedContext = createContext<EmbedContextType>({
  isEmbed: false,
  parentOrigin: null,
  postToHost: () => { },
});

export function EmbedProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isEmbed = isEmbedPath(pathname);
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);

  useEffect(() => {
    if (!isEmbed || window.self === window.top) return;
    try {
      const origin = new URL(document.referrer).origin;
      if (origin && origin !== "null") setParentOrigin(origin);
    } catch {
      // Host sends no referrer - stay silent rather than posting to "*".
    }
  }, [isEmbed]);

  const postToHost = useCallback(
    (event: string, payload?: unknown) => {
      if (!parentOrigin || window.self === window.top) return;
      window.parent.postMessage(
        { source: "noblocks", event, payload },
        parentOrigin,
      );
    },
    [parentOrigin],
  );

  useEffect(() => {
    if (!isEmbed || !parentOrigin) return;
    postToHost("noblocks:ready");

    const observer = new ResizeObserver(() => {
      postToHost("noblocks:resize", {
        height: document.documentElement.scrollHeight,
      });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [isEmbed, parentOrigin, postToHost]);

  const value = useMemo(
    () => ({ isEmbed, parentOrigin, postToHost }),
    [isEmbed, parentOrigin, postToHost],
  );

  return (
    <EmbedContext.Provider value={value}>{children}</EmbedContext.Provider>
  );
}

export const useEmbed = () => useContext(EmbedContext);
