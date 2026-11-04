import { isWalletAppPath } from "./wallet-routes";

export const AUTH_RETURN_STORAGE_KEY = "noblocks-auth-return-path";

/** Only same-origin relative paths; blocks open redirects. */
export function sanitizeAuthReturnPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (!isWalletAppPath(path)) return null;
  return path;
}

export function shouldGuardWalletRoute(pathname: string): boolean {
  return isWalletAppPath(pathname);
}
