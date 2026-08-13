/**
 * Stylized club kits for UI (FPL-style). Generic jersey geometry + public
 * color facts — not official crest/kit artwork. Keys are API-Football team ids.
 */

export type KitPattern = "solid" | "stripes" | "sleeves" | "hoops" | "halves";

export interface ClubKit {
  /** Short code for badge (3 letters). */
  code: string;
  primary: string;
  secondary: string;
  /** Sleeve / stripe accent; defaults to secondary. */
  accent?: string;
  pattern: KitPattern;
  /** Optional GK kit; else a generic keeper green. */
  gk?: { primary: string; secondary: string; pattern?: KitPattern };
}

/** Generic keeper kit when a club has no GK override. */
export const DEFAULT_GK_KIT = {
  primary: "#1a7a3c",
  secondary: "#0f172a",
  pattern: "solid" as KitPattern,
};

const UNKNOWN: ClubKit = {
  code: "FC",
  primary: "#64748b",
  secondary: "#e2e8f0",
  pattern: "solid",
};

/**
 * Home kits for clubs seen in EPL seed / fixtures (API-Football ids).
 * Colors are approximate public brand colors, not licensed assets.
 */
export const CLUB_KITS: Record<number, ClubKit> = {
  // secondary = trim / stripe color; UI ink is derived via contrastingInk(primary)
  33: { code: "MUN", primary: "#da291c", secondary: "#ffffff", pattern: "solid" }, // Man Utd
  34: { code: "NEW", primary: "#241f20", secondary: "#ffffff", pattern: "stripes" }, // Newcastle
  35: { code: "BOU", primary: "#e21a23", secondary: "#111111", pattern: "stripes" }, // Bournemouth
  36: { code: "FUL", primary: "#ffffff", secondary: "#000000", pattern: "solid" }, // Fulham
  39: { code: "WOL", primary: "#fdb913", secondary: "#231f20", pattern: "solid" }, // Wolves
  40: { code: "LIV", primary: "#c8102e", secondary: "#ffffff", pattern: "solid" }, // Liverpool
  41: { code: "SOU", primary: "#d71920", secondary: "#ffffff", pattern: "stripes" }, // Southampton
  42: { code: "ARS", primary: "#ef0107", secondary: "#ffffff", pattern: "sleeves" }, // Arsenal
  45: { code: "EVE", primary: "#003399", secondary: "#ffffff", pattern: "solid" }, // Everton
  46: { code: "LEI", primary: "#003090", secondary: "#fdc400", pattern: "solid" }, // Leicester
  47: { code: "TOT", primary: "#ffffff", secondary: "#132257", pattern: "solid" }, // Spurs
  48: { code: "WHU", primary: "#7a263a", secondary: "#1bb1e7", pattern: "solid" }, // West Ham
  49: { code: "CHE", primary: "#034694", secondary: "#ffffff", pattern: "solid" }, // Chelsea
  50: { code: "MCI", primary: "#6cabdd", secondary: "#1c2c5b", pattern: "solid" }, // Man City
  51: { code: "BHA", primary: "#0057b8", secondary: "#ffffff", pattern: "solid" }, // Brighton
  52: { code: "CRY", primary: "#1b458f", secondary: "#c4122e", pattern: "stripes" }, // Palace
  55: { code: "BRE", primary: "#e30613", secondary: "#ffffff", pattern: "stripes" }, // Brentford
  57: { code: "IPS", primary: "#3a64a2", secondary: "#ffffff", pattern: "solid" }, // Ipswich
  62: { code: "SHU", primary: "#ee2737", secondary: "#ffffff", pattern: "stripes" }, // Sheff Utd
  63: { code: "LEE", primary: "#ffffff", secondary: "#1d428a", pattern: "solid" }, // Leeds
  64: { code: "HUL", primary: "#f5a12d", secondary: "#000000", pattern: "solid" }, // Hull
  65: { code: "NFO", primary: "#e53233", secondary: "#ffffff", pattern: "solid" }, // Nott'm Forest
  66: { code: "AVL", primary: "#95bfe5", secondary: "#670e36", pattern: "sleeves" }, // Aston Villa
  71: { code: "SUN", primary: "#eb172b", secondary: "#ffffff", pattern: "solid" }, // Sunderland
  72: { code: "COV", primary: "#87ceeb", secondary: "#ffffff", pattern: "solid" }, // Coventry
  44: { code: "BUR", primary: "#6c1d45", secondary: "#99d6ea", pattern: "solid" }, // Burnley
  1359: { code: "LUT", primary: "#f78f1e", secondary: "#002d62", pattern: "solid" }, // Luton
};

export function getClubKit(teamId: number | null | undefined): ClubKit {
  if (teamId == null || !Number.isFinite(teamId)) return UNKNOWN;
  const known = CLUB_KITS[teamId];
  if (known) return known;
  // Deterministic fallback so unknown clubs still look distinct.
  const hue = Math.abs(Math.imul(teamId, 2654435761)) % 360;
  return {
    code: "FC",
    primary: `hsl(${hue} 55% 40%)`,
    secondary: `hsl(${hue} 20% 92%)`,
    pattern: "solid",
  };
}

/** Parse #rgb / #rrggbb (returns null for hsl() etc.). */
function parseHex(color: string): { r: number; g: number; b: number } | null {
  const raw = color.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Relative luminance 0–1 (sRGB). */
function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) {
    // hsl("… 55% 40%") — treat mid lightness as medium
    const lm = /([\d.]+)%\s*\)\s*$/.exec(color);
    if (lm) return Number(lm[1]) / 100;
    return 0.45;
  }
  const lin = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** White or near-black ink that contrasts with a fill. */
export function contrastingInk(background: string): string {
  return luminance(background) > 0.55 ? "#0f172a" : "#ffffff";
}

export function kitForPosition(
  teamId: number | null | undefined,
  position: string | undefined,
): {
  primary: string;
  secondary: string;
  accent: string;
  pattern: KitPattern;
  code: string;
  ink: string;
} {
  const kit = getClubKit(teamId);
  if (position === "GK") {
    const gk = kit.gk ?? DEFAULT_GK_KIT;
    return {
      code: kit.code,
      primary: gk.primary,
      secondary: gk.secondary,
      accent: gk.secondary,
      pattern: gk.pattern ?? "solid",
      ink: contrastingInk(gk.primary),
    };
  }
  return {
    code: kit.code,
    primary: kit.primary,
    secondary: kit.secondary,
    accent: kit.accent ?? kit.secondary,
    pattern: kit.pattern,
    ink: contrastingInk(kit.primary),
  };
}

/**
 * Server-safe jersey as SVG data URI for OG / ImageResponse (no React).
 * Mirrors ClubJersey geometry + contrast rules.
 */
export function clubJerseyDataUri(
  teamId: number,
  position?: string,
): string {
  const kit = kitForPosition(teamId, position);
  const uid = `og-${teamId}-${position ?? "x"}`;
  const outline =
    kit.ink === "#ffffff" ? "rgba(0,0,0,0.22)" : "rgba(15,23,42,0.18)";
  const sleeveFill = kit.pattern === "sleeves" ? kit.accent : kit.primary;
  const plateOpacity =
    kit.pattern === "stripes" || kit.pattern === "hoops" ? 0.95 : 0.88;

  let bodyFill = kit.primary;
  let defs = "";
  if (kit.pattern === "stripes") {
    defs = `<pattern id="${uid}-stripes" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="8" fill="${kit.primary}"/><rect x="4" width="4" height="8" fill="${kit.secondary}"/></pattern>`;
    bodyFill = `url(#${uid}-stripes)`;
  } else if (kit.pattern === "hoops") {
    defs = `<pattern id="${uid}-hoops" width="10" height="8" patternUnits="userSpaceOnUse"><rect width="10" height="4" fill="${kit.primary}"/><rect y="4" width="10" height="4" fill="${kit.secondary}"/></pattern>`;
    bodyFill = `url(#${uid}-hoops)`;
  } else if (kit.pattern === "halves") {
    defs = `<linearGradient id="${uid}-halves" x1="0" x2="1" y1="0" y2="0"><stop offset="50%" stop-color="${kit.primary}"/><stop offset="50%" stop-color="${kit.secondary}"/></linearGradient>`;
    bodyFill = `url(#${uid}-halves)`;
  }

  const collarStroke =
    kit.secondary === kit.primary ? outline : kit.secondary;
  const code = kit.code.slice(0, 3);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${defs}</defs><path d="M6 20 C6 18, 8 17, 12 17 L20 17 L20 31 L10 31 C7 31, 6 29, 6 26 Z" fill="${sleeveFill}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/><path d="M58 20 C58 18, 56 17, 52 17 L44 17 L44 31 L54 31 C57 31, 58 29, 58 26 Z" fill="${sleeveFill}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/><path d="M20 16 C24 11, 28 9, 32 9 C36 9, 40 11, 44 16 L44 54 C44 56.5, 40 58, 32 58 C24 58, 20 56.5, 20 54 Z" fill="${bodyFill}" stroke="${outline}" stroke-width="1.1" stroke-linejoin="round"/><path d="M26 11 C28 15.5, 36 15.5, 38 11" fill="none" stroke="${collarStroke}" stroke-width="2" stroke-linecap="round"/><ellipse cx="32" cy="12" rx="5.5" ry="3.2" fill="rgba(0,0,0,0.12)"/><rect x="20" y="28" width="24" height="12" rx="3" fill="${kit.primary}" opacity="${plateOpacity}"/><text x="32" y="34.5" text-anchor="middle" dominant-baseline="central" fill="${kit.ink}" font-size="9" font-weight="800" font-family="ui-sans-serif,system-ui,sans-serif" letter-spacing="0.04em">${code}</text></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
