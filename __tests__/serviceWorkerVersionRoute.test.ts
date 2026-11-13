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
    expect(swSource).toMatch(/NETWORK_ONLY_ROUTES/);
    expect(swSource).toMatch(/api\\\/version/);

    const handlerStart = swSource.indexOf("// Network-only:");
    const handlerEnd = swSource.indexOf("// Network first strategy");
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);

    const versionBranch = swSource.slice(handlerStart, handlerEnd);
    expect(versionBranch).toMatch(/NETWORK_ONLY_ROUTES\.some/);
    expect(versionBranch).toMatch(/fetch\s*\(\s*request\s*\)/);
    expect(versionBranch).not.toMatch(/cache\.put/);
    expect(versionBranch).not.toMatch(/caches\.match/);
  });
});
