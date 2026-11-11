import localFont from "next/font/local";

/**
 * General Sans from Fontshare, self-hosted under the ITF Free Font License.
 * Official woff2 files are unmodified. The CSS variable is registered in the
 * root layout; apply `font-general-sans` only where a screen needs it.
 * Do not subset or convert these files (FFL §02 / §05).
 */
export const generalSans = localFont({
  src: [
    {
      path: "./GeneralSans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./GeneralSans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./GeneralSans-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-general-sans",
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});
