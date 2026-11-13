/** Server/runtime build id (set at compile time via NEXT_PUBLIC_BUILD_ID). */
export function getBuildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID?.trim() || "unknown";
}

/** True when the server should not be compared against the client build id. */
export function isUnusableServerBuildId(buildId: string): boolean {
  const trimmed = buildId.trim();
  return trimmed === "" || trimmed === "unknown";
}
