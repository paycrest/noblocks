"use client";

import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";

import { ensureSentryClientInitialized } from "../lib/sentry.client";

function ErrorFallback({
  resetError,
  eventId,
}: {
  resetError: () => void;
  eventId: string;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p className="text-lg font-medium text-text-body dark:text-white/90">
        Something went wrong
      </p>
      <p className="max-w-md text-sm text-text-secondary dark:text-white/60">
        Please try reloading the page. If the problem continues, contact support
        {eventId ? (
          <>
            {" "}
            and share this reference:{" "}
            <span className="font-mono text-xs text-text-body dark:text-white/80">
              {eventId}
            </span>
          </>
        ) : null}
        .
      </p>
      <button
        type="button"
        onClick={() => {
          resetError();
          window.location.reload();
        }}
        className="rounded-xl bg-lavender-600 px-4 py-2 text-sm text-white transition hover:bg-lavender-700 dark:bg-lavender-500 dark:hover:bg-lavender-600"
      >
        Reload page
      </button>
    </div>
  );
}

/**
 * Browser-only Sentry (GlitchTip-compatible DSN). Wraps the app in an error boundary.
 */
export default function SentryClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  ensureSentryClientInitialized();

  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError, eventId }) => (
        <ErrorFallback resetError={resetError} eventId={eventId} />
      )}
      showDialog={false}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
