import axios from "axios";

const NETWORK_ERROR_PATTERNS = [
  "network error",
  "err_network",
  "err_internet_disconnected",
  "failed to fetch",
  "load failed",
  "fetch failed",
  "econnaborted",
  "net::err_",
  "dns_probe",
];

const RPC_ERROR_PATTERNS = [
  "rpc",
  "unknown rpc",
  "timeout",
  "etimedout",
  "econnrefused",
  "could not connect",
  "execution reverted",
  "call revert exception",
  "missing revert data",
  "transaction failed",
  "intrinsic gas too low",
  "nonce too",
  "replacement transaction underpriced",
  "insufficient funds for gas",
  "thirdweb",
];

const USER_REJECTED_PATTERNS = [
  "user rejected",
  "user denied",
  "user cancelled",
  "user canceled",
  "rejected the request",
  "action_rejected",
];

const HOTJAR_PATTERNS = [
  "hotjar",
  "_hjrecordingready",
  "hjsessionresumed",
  "hj.notifications",
  "hotjar-",
];

export const ERROR_MESSAGES = {
  NETWORK:
    "We couldn't complete your request. Please check your internet connection and try again.",
  SERVER:
    "Something went wrong on our end. Please try again in a moment.",
  CLIENT_REQUEST:
    "We couldn't complete your request. Please try again.",
  BLOCKCHAIN:
    "Something went wrong while connecting to the blockchain. Please try again in a moment.",
  USER_REJECTED:
    "You declined the transaction.",
  FALLBACK:
    "Something went wrong. Please try again.",
} as const;

/**
 * Sentinel value returned when an error should be suppressed entirely
 * (e.g. Hotjar/iframe tracking errors). Callers should check for this
 * and skip toast/setError when received.
 */
export const SUPPRESS = "" as const;

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.shortMessage === "string" && e.shortMessage) return e.shortMessage;
    if (typeof e.message === "string") return e.message;
  }
  return "";
}

function extractCode(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.code === "string") return e.code;
  }
  return "";
}

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function isHotjarError(message: string, code: string): boolean {
  return matchesAny(message, HOTJAR_PATTERNS) || matchesAny(code, HOTJAR_PATTERNS);
}

function isUserRejected(message: string, code: string): boolean {
  return (
    matchesAny(message, USER_REJECTED_PATTERNS) ||
    code.toLowerCase() === "action_rejected"
  );
}

function isRpcError(message: string, code: string): boolean {
  return matchesAny(message, RPC_ERROR_PATTERNS) || matchesAny(code, RPC_ERROR_PATTERNS);
}

function isNetworkError(message: string, code: string): boolean {
  return matchesAny(message, NETWORK_ERROR_PATTERNS) || matchesAny(code, NETWORK_ERROR_PATTERNS);
}

/**
 * Maps an error to a user-friendly message string.
 *
 * Returns `SUPPRESS` ("") for errors that should not be shown to the user
 * (e.g. Hotjar/iframe). Callers must check: if the return value is `SUPPRESS`,
 * do not toast or set error state.
 */
export function mapToUserMessage(error: unknown): string {
  const message = extractMessage(error);
  const code = extractCode(error);

  // 1. Suppress Hotjar/iframe errors
  if (isHotjarError(message, code)) {
    return SUPPRESS;
  }

  // 2. User rejected — preserve intent
  if (isUserRejected(message, code)) {
    return ERROR_MESSAGES.USER_REJECTED;
  }

  // 3. HTTP / axios errors with status codes
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return ERROR_MESSAGES.NETWORK;
    }
    const status = error.response.status;
    if (status >= 500) {
      return ERROR_MESSAGES.SERVER;
    }
    if (status >= 400) {
      const serverMsg = error.response.data?.message;
      if (typeof serverMsg === "string" && serverMsg.length > 0 && serverMsg.length <= 120) {
        return serverMsg;
      }
      return ERROR_MESSAGES.CLIENT_REQUEST;
    }
  }

  // 4. Client-side network failure (non-axios, e.g. fetch)
  if (isNetworkError(message, code)) {
    return ERROR_MESSAGES.NETWORK;
  }

  // 5. RPC / blockchain connection errors (but not user-rejected)
  if (isRpcError(message, code)) {
    return ERROR_MESSAGES.BLOCKCHAIN;
  }

  // 6. Prefer backend / library message when nothing else matched (e.g. aggregator rate errors)
  if (message.trim()) {
    return message;
  }

  return ERROR_MESSAGES.FALLBACK;
}

/**
 * Check if a mapped message is the suppress sentinel.
 * Usage: `const msg = mapToUserMessage(err); if (!isSuppressed(msg)) toast.error(msg);`
 */
export function isSuppressed(message: string): boolean {
  return message === SUPPRESS;
}
