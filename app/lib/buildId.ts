/** Server/runtime build id (set at compile time via NEXT_PUBLIC_BUILD_ID). */
export function getBuildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID?.trim() || "unknown";
}
