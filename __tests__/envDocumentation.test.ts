/**
 * Keeps .env.example in step with the environment variables the code actually
 * reads, in both directions:
 *
 *   - a `process.env.X` read with no entry in .env.example is a variable nobody
 *     knows to set (this is how NEXT_PUBLIC_STARKNET_RPC_URL became a required
 *     but undocumented var);
 *   - an entry in .env.example that nothing reads is a variable people set in
 *     good faith and wonder why it has no effect (this is how MIXPANEL_TOKEN
 *     survived after the code moved to MIXPANEL_SERVER_TOKEN).
 *
 * .env.example is canonical. docs/environment-variables.md is prose and is not
 * checked here.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "..");

/** Directories and files scanned for `process.env` reads. */
const SCAN_TARGETS = [
  "app",
  "middleware.ts",
  "instrumentation.ts",
  "next.config.mjs",
  "sanity.config.ts",
  "sanity.cli.ts",
];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/**
 * Variables deliberately absent from .env.example. Every entry needs a reason —
 * "it is noisy" is not one. Prefer documenting the variable instead.
 */
const NOT_IN_ENV_EXAMPLE = new Set([
  // Supplied by Node and Next.js themselves; never set by an operator.
  "NODE_ENV",
  "NEXT_RUNTIME",
]);

function collectSourceFiles(target: string): string[] {
  const absolute = join(REPO_ROOT, target);
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return []; // Optional target (e.g. instrumentation.ts) not present.
  }

  if (stats.isFile()) {
    return SOURCE_EXTENSIONS.some((ext) => absolute.endsWith(ext))
      ? [absolute]
      : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = join(target, entry.name);
    files.push(...collectSourceFiles(child));
  }
  return files;
}

/** `process.env.FOO` and `process.env["FOO"]`, uppercase names only. */
const ENV_READ_RE =
  /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g;

function envVarsReadInCode(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const target of SCAN_TARGETS) {
    for (const file of collectSourceFiles(target)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(ENV_READ_RE)) {
        const name = match[1] ?? match[2];
        const relative = file.slice(REPO_ROOT.length + 1);
        const seen = found.get(name);
        if (seen) {
          if (!seen.includes(relative)) seen.push(relative);
        } else {
          found.set(name, [relative]);
        }
      }
    }
  }
  return found;
}

/** Entries in .env.example, whether set (`X=`) or commented out (`# X=`). */
function envVarsInExample(): Set<string> {
  const contents = readFileSync(join(REPO_ROOT, ".env.example"), "utf8");
  const names = new Set<string>();
  for (const line of contents.split("\n")) {
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

describe(".env.example", () => {
  const readInCode = envVarsReadInCode();
  const documented = envVarsInExample();

  it("scans a plausible number of files", () => {
    // Guards against a refactor silently emptying SCAN_TARGETS and turning both
    // assertions below into no-ops.
    expect(readInCode.size).toBeGreaterThan(50);
  });

  it("documents every environment variable the code reads", () => {
    const undocumented = [...readInCode.entries()]
      .filter(([name]) => !documented.has(name))
      .filter(([name]) => !NOT_IN_ENV_EXAMPLE.has(name))
      .map(([name, files]) => `  ${name} — read in ${files.join(", ")}`)
      .sort();

    expect(
      undocumented.length === 0
        ? ""
        : `These variables are read by the app but missing from .env.example.\n` +
            `Add an entry (an empty \`NAME=\` is fine) so operators know it exists:\n` +
            undocumented.join("\n"),
    ).toBe("");
  });

  it("has no entries the code never reads", () => {
    const unused = [...documented]
      .filter((name) => !readInCode.has(name))
      // Script-only variables live in .env.example for discoverability but are
      // read under scripts/, which is outside SCAN_TARGETS.
      .filter((name) => !SCRIPT_ONLY.has(name))
      .sort();

    expect(
      unused.length === 0
        ? ""
        : `These entries in .env.example are read nowhere in the app.\n` +
            `Remove them, or fix the name if the code uses a different one:\n` +
            unused.map((name) => `  ${name}`).join("\n"),
    ).toBe("");
  });
});

/** Documented for operators, but only read by files under scripts/. */
const SCRIPT_ONLY = new Set([
  "SEED_DELAY_MS",
  "SEED_SKIP_PLAYERS",
  "SEED_TIMELAPSE_HOURS",
  "SEED_TIMELAPSE_GWS",
  "DRY_RUN",
  "MORALIS_MS_DELAY",
]);
