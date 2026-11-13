import { execSync } from "node:child_process";

/**
 * Build identifier baked into client and server bundles. On DigitalOcean App
 * Platform, set env `COMMIT_HASH` to the bindable `${_self.COMMIT_HASH}`
 * (BUILD_TIME or RUN_AND_BUILD_TIME) so deploys get a stable git SHA.
 */
export function resolveBuildId() {
  const fromEnv = [
    process.env.COMMIT_HASH,
    process.env.GITHUB_SHA,
    process.env.SOURCE_VERSION,
  ].find((value) => value && String(value).trim());

  if (fromEnv) {
    return String(fromEnv).trim();
  }

  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return `build-${Date.now()}`;
  }
}
