#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ARTIFACT_ROOT = process.env.KAN954_ARTIFACT_ROOT ?? "/opt/cursor/artifacts/kan954-r2";
const BASE = process.env.KAN954_BASE_URL ?? "http://127.0.0.1:3002";

const drawerScenes = [
  { scene: "filled", file: "drawer-filled.png" },
  { scene: "review", file: "drawer-review.png" },
  { scene: "progress1", file: "progress-step1.png" },
  { scene: "progress3", file: "progress-step3.png" },
  { scene: "receipt-success", file: "receipt-success-drawer.png" },
  { scene: "receipt-failed", file: "receipt-failed-drawer.png" },
];

const staticScenes = [
  { scene: "review-modal", file: "review-modal-swap.png" },
  { scene: "receipt-modal", file: "receipt-success-modal.png" },
  { scene: "toast", file: "success-toast.png" },
];

const themes = ["dark", "light"];

for (const theme of themes) {
  mkdirSync(join(ARTIFACT_ROOT, theme), { recursive: true });
}

const { chromium } = await import("playwright");

function applyTheme(page, theme) {
  return page.evaluate((mode) => {
    const root = document.documentElement;
    if (mode === "light") {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    } else {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    }
  }, theme);
}

const browser = await chromium.launch({ headless: true });

for (const theme of themes) {
  const outDir = join(ARTIFACT_ROOT, theme);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
    colorScheme: theme,
  });
  const page = await context.newPage();

  for (const { scene, file } of drawerScenes) {
    await page.goto(`${BASE}/kan954-harness?scene=${scene}&theme=${theme}`, {
      waitUntil: "networkidle",
    });
    await applyTheme(page, theme);
    await page.click('[data-testid="open-drawer"]');
    await page.waitForSelector('[aria-label="Close"]');
    await sleep(350);

    if (theme === "dark") {
      const close = page.locator('[aria-label="Close"]').first();
      const ringOnMouseOpen = await close.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        const outline = styles.outlineWidth;
        const boxShadow = styles.boxShadow;
        return (
          (outline && outline !== "0px") ||
          (boxShadow &&
            boxShadow !== "none" &&
            /139,\s*133,\s*244|lavender/i.test(boxShadow))
        );
      });
      if (ringOnMouseOpen) {
        console.warn(`warn: close focus ring on mouse open (${theme}/${file})`);
      }
    }

    await page.screenshot({ path: join(outDir, file), fullPage: false });
    console.log("saved", `${theme}/${file}`);
  }

  for (const { scene, file } of staticScenes) {
    await page.goto(`${BASE}/kan954-harness?scene=${scene}&theme=${theme}`, {
      waitUntil: "networkidle",
    });
    await applyTheme(page, theme);
    await sleep(scene === "toast" ? 800 : 400);
    await page.screenshot({ path: join(outDir, file), fullPage: false });
    console.log("saved", `${theme}/${file}`);
  }

  await context.close();
}

await browser.close();
