/**
 * Headless Home layout captures for KAN-969 design QA (no Privy / portfolio API).
 * Run: node scripts/capture-kan969-home-artifacts.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = "/opt/cursor/artifacts/kan-969-design-qa";

const exploreCard = (title, desc, bannerColor, bannerLabel) => `
  <article class="flex min-w-[260px] flex-1 flex-col rounded-[20px] bg-accent-gray p-3 dark:bg-white/5">
    <div class="mb-4 h-[127px] overflow-hidden rounded-[10px]" style="background:${bannerColor}">
      <div class="flex h-full items-center justify-center text-xs font-semibold text-white/80">${bannerLabel}</div>
    </div>
    <h3 class="text-base font-semibold text-text-body dark:text-white">${title}</h3>
    <p class="mt-1 text-sm font-medium text-text-secondary dark:text-white/50">${desc}</p>
  </article>`;

function homeHtml(theme, funded) {
  const dark = theme === "dark";
  const balance = funded ? "$1,257.94" : "$0.00";
  const addFundsSplit = funded
    ? `<div class="inline-flex h-9 items-center rounded-xl bg-black text-white dark:bg-white dark:text-black">
         <span class="px-5 text-sm font-semibold">Add funds</span>
         <span class="flex h-9 items-center border-l border-black/10 px-2.5 dark:border-white/20">▼</span>
       </div>`
    : "";
  const getStarted = !funded
    ? `<div class="flex flex-col gap-4 rounded-[20px] bg-accent-gray px-4 py-4 dark:bg-white/5 sm:flex-row sm:items-center sm:justify-between">
         <div>
           <h2 class="text-base font-semibold text-text-body dark:text-white">Add funds to get started</h2>
           <p class="mt-2 text-sm text-text-secondary dark:text-white/50">We support 80+ assets across 35+ networks</p>
         </div>
         <button type="button" class="h-8 rounded-xl bg-black px-4 text-sm font-semibold text-white dark:bg-white dark:text-black">Add funds</button>
       </div>`
    : "";

  const rows = funded
    ? [
        ["My tokens", "2 Assets", "$1,090.56"],
        ["Earn positions", "6 Assets earning up to 4.4% pa", "$129.05"],
        ["My stocks", "2 companies", "$250.17"],
      ]
    : [
        ["My tokens", "No assets yet", "$0"],
        ["Earn positions", "No assets yet", "$0"],
        ["My stocks", "No assets yet", "$0"],
      ];

  const rowHtml = rows
    .map(
      ([title, sub, amt]) => `
    <div class="flex items-center gap-3 border-t border-border-light px-4 py-2 first:border-t-0 dark:border-white/10">
      <span class="flex size-[35px] shrink-0 rounded-[10px] bg-accent-gray dark:bg-white/10"></span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-semibold text-text-body dark:text-white">${title}</span>
        <span class="block text-sm text-text-secondary dark:text-white/50">${sub}</span>
      </span>
      <span class="text-sm font-semibold text-text-body dark:text-white">${amt} ›</span>
    </div>`,
    )
    .join("");

  const explore = `
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-text-body dark:text-white">Explore</h2>
      <div class="flex gap-3 overflow-x-auto pb-1">
        ${exploreCard("Own popular stocks from $1", "Buy a piece of Nvidia, Apple and more with your balance.", "#00A1DB", "Stocks banner")}
        ${exploreCard("Earn up to 4.4% a year", "Your balance grows while you hold it. Withdraw any time.", "#A2001D", "Earn banner")}
        ${exploreCard("Invite friends", "Share your link and track who has joined.", "#D4A100", "Invite banner")}
      </div>
    </section>`;

  return `<!DOCTYPE html>
<html lang="en" class="${dark ? "dark" : ""}">
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            black: "#121217",
            accent: { gray: "#F7F7F8" },
            border: { light: "#EBEBEF" },
            text: { body: "#121217", secondary: "#6C6C89" },
            surface: { canvas: "#141414" },
            background: { neutral: "#F9FAFB" },
          },
        },
      },
    };
  </script>
  <style>
    body { font-family: Inter, system-ui, sans-serif; }
  </style>
</head>
<body class="m-0 bg-white p-8 dark:bg-surface-canvas">
  <div class="mx-auto flex max-w-3xl flex-col gap-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-sm text-text-secondary dark:text-white/50">Your balances</p>
        <p class="text-[35px] font-semibold leading-9 tracking-[-1.05px] text-text-body dark:text-white">${balance}</p>
      </div>
      ${addFundsSplit}
    </div>
    ${getStarted}
    <div class="overflow-hidden rounded-[20px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
      ${rowHtml}
    </div>
    ${explore}
  </div>
</body>
</html>`;
}

async function main() {
  mkdirSync(join(outRoot, "light"), { recursive: true });
  mkdirSync(join(outRoot, "dark"), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });

  for (const theme of ["light", "dark"]) {
    for (const funded of [false, true]) {
      const name = funded ? "home-funded" : "home-empty";
      await page.setContent(homeHtml(theme, funded), { waitUntil: "networkidle" });
      await page.screenshot({
        path: join(outRoot, theme, `${name}.png`),
        fullPage: true,
      });
    }
    await page.setContent(homeHtml(theme, true), { waitUntil: "networkidle" });
    await page.locator("section").screenshot({
      path: join(outRoot, theme, "explore-cards.png"),
    });
  }

  await browser.close();
  console.log(`Saved captures under ${outRoot}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
