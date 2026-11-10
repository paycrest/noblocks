/// <reference types="jest" />

import fs from "node:fs";
import path from "node:path";

/**
 * Guards deploy-detection: `/api/version` must never be written to the Cache API
 * or read from it when offline — stale build ids would break update prompts.
 */
describe("public/sw.js /api/version", () => {
  const swSource = fs.readFileSync(
    path.join(__dirname, "../public/sw.js"),
    "utf8",
  );

  it("handles /api/version network-only without cache.put or caches.match", () => {
    const networkOnlyIdx = swSource.indexOf("NETWORK_ONLY_ROUTES");
    expect(networkOnlyIdx).toBeGreaterThan(-1);

    const networkFirstIdx = swSource.indexOf(
      "NETWORK_FIRST_ROUTES",
      networkOnlyIdx,
    );
    expect(networkFirstIdx).toBeGreaterThan(networkOnlyIdx);

    const versionBranch = swSource.slice(networkOnlyIdx, networkFirstIdx);
    expect(versionBranch).toMatch(/\/api\/version/);
    expect(versionBranch).toMatch(/fetch\s*\(\s*request\s*\)/);
    expect(versionBranch).not.toMatch(/cache\.put/);
    expect(versionBranch).not.toMatch(/caches\.match/);
  });
});
