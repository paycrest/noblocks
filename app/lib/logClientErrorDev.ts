"use client";

import type { DevClientErrorPayload } from "@/app/lib/devClientError.types";

/** Dev-only: POST client errors to the Next server so they appear in the `pnpm dev` terminal. */

const MAX_CAUSE_DEPTH = 8;
const MAX_MESSAGE_LEN = 2000;

function truncate(text: string): string {
  if (text.length <= MAX_MESSAGE_LEN) return text;
  return `${text.slice(0, MAX_MESSAGE_LEN)}…[truncated]`;
}

function collectErrorParts(error: unknown): DevClientErrorPayload["error"] {
  const causes: string[] = [];
  let name: string | undefined;
  let message = "Unknown error";
  let shortMessage: string | undefined;
  let code: string | undefined;
  let stack: string | undefined;
  let details: string | undefined;

  function walk(err: unknown, depth: number): void {
    if (depth > MAX_CAUSE_DEPTH || err == null) return;

    if (err instanceof Error) {
      if (depth === 0) {
        name = err.name;
        message = err.message || message;
        stack = err.stack;
      } else {
        causes.push(truncate(err.message || String(err)));
      }
      const any = err as Error & {
        shortMessage?: string;
        code?: string;
        details?: string;
        cause?: unknown;
      };
      if (depth === 0 && typeof any.shortMessage === "string") {
        shortMessage = truncate(any.shortMessage);
      }
      if (depth === 0 && typeof any.code === "string") {
        code = any.code;
      }
      if (depth === 0 && typeof any.details === "string") {
        details = truncate(any.details);
      }
      walk(any.cause, depth + 1);
      return;
    }

    if (typeof err === "object") {
      const o = err as Record<string, unknown>;
      if (depth === 0) {
        if (typeof o.message === "string") message = o.message;
        if (typeof o.shortMessage === "string") {
          shortMessage = truncate(o.shortMessage);
        }
        if (typeof o.code === "string") code = o.code;
        if (typeof o.details === "string") details = truncate(o.details);
      } else if (typeof o.message === "string") {
        causes.push(truncate(o.message));
      }
      walk(o.cause, depth + 1);
      return;
    }

    if (depth === 0) message = String(err);
    else causes.push(truncate(String(err)));
  }

  walk(error, 0);

  return {
    name,
    message: truncate(message),
    shortMessage,
    code,
    stack: stack ? truncate(stack) : undefined,
    details,
    causes,
  };
}

/**
 * Logs to browser console and mirrors to the local Next.js terminal via POST /api/dev/client-error.
 * No-op outside development.
 */
export function logClientErrorDev(
  feature: string,
  step: string,
  error: unknown,
  context?: Record<string, string | number | boolean | null>,
): void {
  if (process.env.NODE_ENV !== "development") return;

  const payload: DevClientErrorPayload = {
    feature,
    step,
    error: collectErrorParts(error),
    context,
  };

  console.error(`[${feature}] ${step}`, error, context ?? {});

  void fetch("/api/dev/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Never block UX if the dev log endpoint is unavailable.
  });
}
