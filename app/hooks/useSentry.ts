/**
 * React hook for Sentry error tracking
 * Follows the same pattern as useMixpanel
 */

import { useEffect } from "react";
import { initErrorHandlers } from "@/app/lib/sentry";

export function useSentry() {
    useEffect(() => {
        const cleanup = initErrorHandlers();
        return cleanup;
    }, []);
}

export { captureException } from "@/app/lib/sentry";

