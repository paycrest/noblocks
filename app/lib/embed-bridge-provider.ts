"use client";

/**
 * Host-wallet EIP-1193 bridge (iframe side) for the embedded /widget.
 *
 * With ?injected=bridge, the widget's "injected wallet" is not window.ethereum
 * but the host page's connected provider (WalletConnect, AppKit, wagmi, ...),
 * reached over postMessage. The host binds its provider with
 * NoblocksEmbed.bindWallet() from public/embed.js:
 *
 *   widget -> host  { source: "noblocks", event: "noblocks:wallet_request",
 *                     payload: { id, method, params } }
 *   host -> widget  { source: "noblocks-host", event: "noblocks:wallet_response",
 *                     payload: { id, result?, error?: { code, message } } }
 *   host -> widget  { source: "noblocks-host", event: "noblocks:wallet_event",
 *                     payload: { event: "accountsChanged" | "chainChanged"
 *                              | "disconnect", data } }
 *
 * Signing UX stays in the host's own wallet — the widget never sees keys.
 */

type Eip1193RequestArgs = { method: string; params?: unknown };
type EventHandler = (...args: unknown[]) => void;

export interface BridgeProvider {
  isNoblocksBridge: true;
  request: (args: Eip1193RequestArgs) => Promise<unknown>;
  on: (event: string, handler: EventHandler) => void;
  removeListener: (event: string, handler: EventHandler) => void;
  /** Tear down the window message listener (tests / mode switches). */
  destroy: () => void;
}

// Methods that surface the host's wallet UI and wait on the user.
const INTERACTIVE_METHODS = new Set([
  "eth_requestAccounts",
  "eth_sendTransaction",
  "eth_signTransaction",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "wallet_watchAsset",
]);
const INTERACTIVE_TIMEOUT_MS = 5 * 60_000;
const READ_TIMEOUT_MS = 30_000;
/** How long to wait for embed.js's receipt ACK before deciding no host bridge exists. */
const BRIDGE_ACK_TIMEOUT_MS = 4_000;
/** EIP-1193 4900 "disconnected" — no host bridge answered; callers should fall back. */
export const BRIDGE_UNAVAILABLE_CODE = 4900;

class BridgeRpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

let singleton: { origin: string; provider: BridgeProvider } | null = null;

export function createBridgeProvider(parentOrigin: string): BridgeProvider {
  if (singleton?.origin === parentOrigin) return singleton.provider;
  singleton?.provider.destroy();

  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      ackTimer?: ReturnType<typeof setTimeout>;
    }
  >();
  const listeners = new Map<string, Set<EventHandler>>();

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== parentOrigin || event.source !== window.parent) return;
    const data = event.data as {
      source?: string;
      event?: string;
      payload?: any;
    };
    if (data?.source !== "noblocks-host") return;

    if (data.event === "noblocks:wallet_ack") {
      // embed.js acknowledges receipt before forwarding to the provider —
      // the host bridge exists, so only the method timeout applies from here.
      const entry = pending.get(data.payload?.id);
      if (entry?.ackTimer) {
        clearTimeout(entry.ackTimer);
        entry.ackTimer = undefined;
      }
    } else if (data.event === "noblocks:wallet_response") {
      const { id, result, error } = data.payload ?? {};
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      if (entry.ackTimer) clearTimeout(entry.ackTimer);
      if (error) {
        entry.reject(
          new BridgeRpcError(
            typeof error.code === "number" ? error.code : -32603,
            error.message || "Host wallet request failed",
          ),
        );
      } else {
        entry.resolve(result);
      }
    } else if (data.event === "noblocks:wallet_event") {
      const { event: providerEvent, data: eventData } = data.payload ?? {};
      listeners.get(providerEvent)?.forEach((handler) => handler(eventData));
    }
  };
  window.addEventListener("message", onMessage);

  const provider: BridgeProvider = {
    isNoblocksBridge: true,
    request: ({ method, params }: Eip1193RequestArgs) => {
      const id = nextId++;
      return new Promise<unknown>((resolve, reject) => {
        const timeoutMs = INTERACTIVE_METHODS.has(method)
          ? INTERACTIVE_TIMEOUT_MS
          : READ_TIMEOUT_MS;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(
            new BridgeRpcError(
              -32603,
              `Host wallet did not respond to ${method}. Is NoblocksEmbed.bindWallet() set up on the host page?`,
            ),
          );
        }, timeoutMs);
        // Fast-fail when NO host bridge is listening at all (embed.js not
        // loaded / bindWallet never called — e.g. a plain iframe embed that
        // passed ?injected=bridge). embed.js ACKs every request immediately,
        // so a missing ACK means nobody is on the other end; reject quickly
        // with a distinct code (4900: EIP-1193 "disconnected") so the app can
        // fall back to the standard login flow instead of hanging on the
        // 5-minute interactive timeout.
        const ackTimer = setTimeout(() => {
          const entry = pending.get(id);
          if (!entry) return;
          pending.delete(id);
          clearTimeout(entry.timer);
          reject(
            new BridgeRpcError(
              BRIDGE_UNAVAILABLE_CODE,
              "No host wallet bridge responded. Load /embed.js and call NoblocksEmbed.bindWallet() on the host page, or drop ?injected=bridge.",
            ),
          );
        }, BRIDGE_ACK_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer, ackTimer });
        window.parent.postMessage(
          {
            source: "noblocks",
            event: "noblocks:wallet_request",
            payload: { id, method, params },
          },
          parentOrigin,
        );
      });
    },
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    removeListener: (event, handler) => {
      listeners.get(event)?.delete(handler);
    },
    destroy: () => {
      window.removeEventListener("message", onMessage);
      pending.forEach((entry) => {
        clearTimeout(entry.timer);
        if (entry.ackTimer) clearTimeout(entry.ackTimer);
        entry.reject(new BridgeRpcError(-32603, "Bridge provider destroyed"));
      });
      pending.clear();
      listeners.clear();
      if (singleton?.provider === provider) singleton = null;
    },
  };

  singleton = { origin: parentOrigin, provider };
  return provider;
}
