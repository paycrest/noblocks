/**
 * Server-side detection of injected-wallet sessions.
 *
 * `?injected=true|bridge` is a client-only URL parameter — the widget renders with
 * `ssr: false`, so no API route ever sees it. The only server-side signal is the SIWE
 * session JWT: middleware verifies `x-injected-token` and derives the subject
 * `injected-<address>` for `x-user-id`, where Privy sessions carry a `did:privy:…`.
 *
 * That signal cannot distinguish `true` from `bridge` — both mint the same token — so
 * anything keyed off it necessarily covers both modes.
 */

/** Prefix middleware gives the `x-user-id` of an injected-wallet session. */
export const INJECTED_USER_ID_PREFIX = "injected-";

/** True when a user id came from an injected-wallet (SIWE) session. */
export function isInjectedUserId(userId: string | null | undefined): boolean {
  return !!userId && userId.startsWith(INJECTED_USER_ID_PREFIX);
}
