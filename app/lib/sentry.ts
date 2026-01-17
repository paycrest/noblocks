import type { SentryConfig, SentryEvent } from "@/app/types";

function getConfig(): SentryConfig {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sentryConfig } = require("./config");
    return sentryConfig;
}

function parseStackTrace(error: Error) {
    if (!error.stack) return [];
    const frames: Array<{
        filename?: string;
        function?: string;
        lineno?: number;
        colno?: number;
        in_app?: boolean;
    }> = [];

    error.stack.split("\n").forEach((line) => {
        // Try pattern with function name first
        let match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
            frames.push({
                function: match[1],
                filename: match[2],
                lineno: parseInt(match[3], 10) || undefined,
                colno: parseInt(match[4], 10) || undefined,
                in_app: true,
            });
        } else {
            // Try pattern without function name
            match = line.match(/at\s+(.+?):(\d+):(\d+)/);
            if (match) {
                frames.push({
                    function: undefined,
                    filename: match[1],
                    lineno: parseInt(match[2], 10) || undefined,
                    colno: parseInt(match[3], 10) || undefined,
                    in_app: true,
                });
            }
        }
    });
    return frames.reverse();
}

function createEvent(
    error: Error | string,
    context: {
        level?: "fatal" | "error" | "warning" | "info" | "debug";
        tags?: Record<string, string>;
        extra?: Record<string, any>;
        user?: {
            id?: string;
            email?: string;
            username?: string;
            ip_address?: string;
        };
        request?: {
            url?: string;
            method?: string;
            headers?: Record<string, string>;
            query_string?: string;
        };
    } = {}
): SentryEvent {
    const isError = error instanceof Error;
    const message = isError ? error.message : String(error);
    const errorObj = isError ? error : new Error(message);
    const config = getConfig();

    const event: SentryEvent = {
        message,
        level: context.level || "error",
        timestamp: Math.floor(Date.now() / 1000),
        environment: config.environment,
        release: config.release,
        platform: "javascript",
        sdk: { name: "sentry-api", version: "1.0.0" },
        user: context.user,
        tags: {
            ...context.tags,
            source: typeof window === "undefined" ? "server" : "client",
        },
        extra: {
            ...context.extra,
            page_url:
                typeof window !== "undefined" ? window.location.href : undefined,
            user_agent:
                typeof window !== "undefined" ? navigator.userAgent : undefined,
        },
        request:
            context.request ||
            (typeof window !== "undefined"
                ? {
                    url: window.location.href,
                    method: "GET",
                    query_string: window.location.search,
                }
                : undefined),
    };

    if (isError && errorObj.stack) {
        event.exception = {
            values: [
                {
                    type: errorObj.name || "Error",
                    value: errorObj.message,
                    stacktrace: { frames: parseStackTrace(errorObj) },
                },
            ],
        };
    }

    return event;
}

async function sendEvent(event: SentryEvent): Promise<boolean> {
    const config = getConfig();

    if (!config.enabled) {
        return false;
    }

    if (Math.random() > config.sampleRate) {
        return false;
    }

    // Check if required config is present
    if (!config.serverUrl || !config.projectId || !config.publicKey) {
        console.error("[Sentry] Missing configuration");
        return false;
    }

    try {
        const isServer = typeof window === "undefined";
        const url = isServer
            ? `${config.serverUrl}/api/${config.projectId}/store/`
            : "/api/sentry-tunnel";

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (isServer) {
            headers["X-Sentry-Auth"] = `Sentry sentry_version=7, sentry_key=${config.publicKey}, sentry_client=sentry-api/1.0.0`;
        }

        // For server-side, add event_id directly to the event (not wrapped in payload)
        // Client-side will be handled by the tunnel route
        let body: string;
        if (isServer) {
            // Generate event_id (UUID without dashes, lowercase for Sentry format)
            const eventId = crypto.randomUUID().replace(/-/g, "").toLowerCase();
            body = JSON.stringify({
                event_id: eventId,
                ...event,
            });
        } else {
            body = JSON.stringify(event);
        }

        const response = await fetch(url, {
            method: "POST",
            headers,
            body,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Sentry] API error: ${response.status} ${response.statusText}`, errorText);
            return false;
        }

        return true;
    } catch (error) {
        console.error("[Sentry] Failed to send error:", error);
        return false;
    }
}

function shouldIgnoreError(error: Error | string): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorString = errorMessage.toLowerCase();

    // Filter out development-specific webpack/Next.js chunk errors
    const config = getConfig();
    if (config.environment === "development") {
        if (errorString.includes("webpack") || errorString.includes("next")) {
            if (
                errorString.includes("chunk") ||
                errorString.includes("load") ||
                errorString.includes("chunkload")
            ) {
                return true;
            }
        }
    }

    return false;
}

export async function captureException(
    error: Error | string,
    context: {
        level?: "fatal" | "error" | "warning" | "info" | "debug";
        tags?: Record<string, string>;
        extra?: Record<string, any>;
        user?: {
            id?: string;
            email?: string;
            username?: string;
            ip_address?: string;
        };
        request?: {
            url?: string;
            method?: string;
            headers?: Record<string, string>;
            query_string?: string;
        };
    } = {}
): Promise<void> {
    // Filter out HMR and other development noise
    if (shouldIgnoreError(error)) {
        return;
    }

    await sendEvent(createEvent(error, context));
}

export function initErrorHandlers(): () => void {
    if (typeof window === "undefined") {
        return () => { };
    }

    const config = getConfig();
    if (!config.enabled) {
        return () => { };
    }

    const handleError = (e: ErrorEvent) => {
        const error = e.error || new Error(e.message);
        if (!shouldIgnoreError(error)) {
            captureException(error, {
                level: "error",
                tags: { errorType: "unhandledError" },
                extra: {
                    filename: e.filename,
                    lineno: e.lineno,
                    colno: e.colno,
                },
            }).catch(() => {
                // Silently fail
            });
        }
    };

    const handleRejection = (e: PromiseRejectionEvent) => {
        const error =
            e.reason instanceof Error ? e.reason : new Error(String(e.reason));
        if (!shouldIgnoreError(error)) {
            captureException(error, {
                level: "error",
                tags: { errorType: "unhandledRejection" },
            }).catch(() => {
                // Silently fail
            });
        }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
        window.removeEventListener("error", handleError);
        window.removeEventListener("unhandledrejection", handleRejection);
    };
}
