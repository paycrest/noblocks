/**
 * Server-Side Tracking Helper Hook
 * 
 * Provides client-side functions that call server-side tracking endpoints.
 * These functions are fire-and-forget and include error handling to ensure
 * they don't break the client-side flow.
 * 
 * This enables reliable tracking that bypasses ad blockers and browser
 * privacy settings while maintaining a clean client-side API.
 */

/**
 * Helper function to make a fire-and-forget API call with error handling
 * Ensures tracking failures never impact user experience
 */
const makeTrackingRequest = async (
    endpoint: string,
    payload: Record<string, any>,
): Promise<void> => {
    const controller = new AbortController();
    // Increased timeout to 3s to handle potential Next.js compilation delays
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        // Silently handle errors - tracking failures should not affect user experience
        // Response errors are ignored to prevent breaking user flow
    } catch {
        // Silently handle all errors - tracking failures should not affect user experience
        // This includes network errors, timeouts, and other exceptions
    } finally {
        clearTimeout(timeoutId);
    }
};

/**
 * Track an event server-side
 * @param eventName - Name of the event to track
 * @param properties - Event properties
 * @param walletAddress - Optional wallet address (will use auth context if available)
 */
export const trackServerEvent = async (
    eventName: string,
    properties: Record<string, any> = {},
    walletAddress?: string,
): Promise<void> => {
    await makeTrackingRequest(
        "/api/v1/analytics/track",
        {
            eventName,
            properties,
            ...(walletAddress && { walletAddress }),
        },
    );
};

/**
 * Identify a user server-side
 * @param walletAddress - User's wallet address
 * @param properties - User properties (login_method, isNewUser, createdAt, email)
 */
export const identifyServerUser = async (
    walletAddress: string,
    properties: {
        login_method?: string | null;
        isNewUser?: boolean;
        createdAt?: Date | string;
        email?: { address: string } | null;
    } = {},
): Promise<void> => {
    await makeTrackingRequest(
        "/api/v1/analytics/identify",
        {
            walletAddress,
            properties,
        },
    );
};
