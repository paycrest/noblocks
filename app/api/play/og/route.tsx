import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { createAvatar } from "@dicebear/core";
import { bigSmile, openPeeps } from "@dicebear/collection";
import config from "@/app/lib/config";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getPublicManagerTeam } from "@/app/lib/fantasy/server";
import type { Position } from "@/app/lib/fantasy/types";

const CACHE_CONTROL = "public, max-age=60, s-maxage=300";

/** Clamp a username to the on-card format: ≤20 chars, alnum/underscore only. */
const sanitizeUsername = (value: string | null): string => {
  const cleaned = (value ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  return cleaned || "player";
};

/** Parse a positive integer query param, else "—". */
const sanitizeNumber = (value: string | null): string => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0
    ? String(Math.min(parsed, 999_999_999))
    : "—";
};

/** Referral codes are NB + 4 alphanumerics; keep only safe chars. */
const sanitizeCode = (value: string | null): string =>
  (value ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);

const INK = "#3b2d0e"; // dark brown-gold FUT ink
const INK_SOFT = "rgba(59, 45, 14, 0.72)";

// Card geometry: the real FUT gold card art (public/cards/gold.png, 540×820
// RGBA) scaled to height 540.
const CARD_W = 356;
const CARD_H = 540;

/** Anton (OFL) — the condensed display face that sells the FUT look. */
let antonFont: Promise<Buffer> | null = null;
const loadAnton = () =>
  (antonFont ??= readFile(
    path.join(process.cwd(), "public/fonts/Anton-Regular.ttf"),
  ));

/** The gold card art, inlined once as a data URI. */
let goldCard: Promise<string> | null = null;
const loadGoldCard = () =>
  (goldCard ??= readFile(
    path.join(process.cwd(), "public/cards/gold.png"),
  ).then((buf) => `data:image/png;base64,${buf.toString("base64")}`));

/**
 * The card portrait: a DiceBear illustration generated locally (no network),
 * DETERMINISTIC from the username — every manager gets their own recurring
 * character. big-smile by default; Open Peeps (CC0) as the alternate style.
 */
function generateAvatar(username: string, style: string | null): string {
  // flip: the characters face right by default — mirrored so they always
  // look inward (left, toward the rating) from the card's right side.
  const options = { seed: username.toLowerCase(), size: 512, flip: true };
  const svg = (
    style === "peeps"
      ? createAvatar(openPeeps, options)
      : createAvatar(bigSmile, options)
  ).toString();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Portrait window on the card (ref: gitfut's geometry) + its fade mask.
const PHOTO = { top: 62, right: 16, width: 246, height: 258 };
const PHOTO_MASK =
  "radial-gradient(ellipse 66% 88% at 52% 55%, #000 56%, transparent 90%)";

// ─── Squad snapshot (layout=squad) ───────────────────────────────────────────

const POS_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];
const POS_COLOR: Record<Position, { bg: string; fg: string }> = {
  GK: { bg: "#eab308", fg: "#1c1400" },
  DEF: { bg: "#0ea5e9", fg: "#ffffff" },
  MID: { bg: "#10b981", fg: "#ffffff" },
  FWD: { bg: "#f43f5e", fg: "#ffffff" },
};

const playerInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

const lastName = (name: string) => name.split(" ").slice(-1)[0] ?? name;

/**
 * Player headshot as a data URI so satori never does its own (uncontrolled)
 * remote fetch. Tight timeout + size cap; any failure falls back to the
 * initials chip for that player only — one flaky CDN image can't break or
 * stall the whole card.
 */
async function fetchPhotoDataUri(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 400_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 1200×630 squad snapshot: the XI on a pitch panel (real headshots with
 * initials fallback, C/V badges, effective points) + manager stats and the
 * #NoblocksPlay hashtag.
 */
async function squadImage(usernameParam: string, anton: Buffer) {
  const manager = await getPublicManagerTeam(usernameParam);
  if (!manager?.team) {
    return Response.json(
      { success: false, error: "No shareable squad yet" },
      { status: 404 },
    );
  }
  const { team } = manager;

  const xi = team.players.filter((p) => p.slot <= 11);
  const bench = team.players.filter((p) => p.slot > 11);

  const photos = new Map<number, string | null>();
  await Promise.all(
    xi.map(async (p) => photos.set(p.player_id, await fetchPhotoDataUri(p.photo_url))),
  );

  const slot = (p: (typeof team.players)[number]) => (
    <div
      key={p.player_id}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 104,
      }}
    >
      <div style={{ display: "flex", position: "relative" }}>
        {photos.get(p.player_id) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photos.get(p.player_id)!}
            alt=""
            width={58}
            height={58}
            style={{
              width: 58,
              height: 58,
              borderRadius: 999,
              objectFit: "cover",
              objectPosition: "top",
              backgroundColor: "rgba(255,255,255,0.92)",
              border: `3px solid ${POS_COLOR[p.position].bg}`,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 58,
              height: 58,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              letterSpacing: 1,
              backgroundColor: POS_COLOR[p.position].bg,
              color: POS_COLOR[p.position].fg,
              border: "3px solid rgba(255,255,255,0.85)",
            }}
          >
            {playerInitials(p.name)}
          </div>
        )}
        {(p.is_captain || p.is_vice) && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: -6,
              left: -8,
              width: 24,
              height: 24,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              backgroundColor: p.is_captain ? "#000000" : "#ffffff",
              color: p.is_captain ? "#ffffff" : "#000000",
              border: "2px solid rgba(255,255,255,0.9)",
            }}
          >
            {p.is_captain ? "C" : "V"}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 7,
          maxWidth: 104,
          fontSize: 16,
          letterSpacing: 1,
          color: "#ffffff",
        }}
      >
        {lastName(p.name).toUpperCase().slice(0, 11)}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 14,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        {`${p.points} PTS`}
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          backgroundImage:
            "radial-gradient(circle at 30% 40%, #06281c 0%, #041b13 55%, #02100b 100%)",
          padding: "36px 48px",
          fontFamily: "Anton",
        }}
      >
        {/* pitch panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 660,
            height: 558,
            borderRadius: 24,
            padding: "20px 12px 14px",
            backgroundImage:
              "linear-gradient(180deg, #059669 0%, #047857 55%, #065f46 100%)",
            border: "2px solid rgba(255,255,255,0.25)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              justifyContent: "space-between",
            }}
          >
            {POS_ORDER.map((pos) => (
              <div
                key={pos}
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {xi.filter((p) => p.position === pos).map(slot)}
              </div>
            ))}
          </div>
          {bench.length > 0 && (
            <div
              style={{
                display: "flex",
                marginTop: 12,
                justifyContent: "center",
                fontSize: 15,
                letterSpacing: 1,
                color: "rgba(255,255,255,0.65)",
              }}
            >
              {`BENCH — ${bench.map((p) => lastName(p.name).toUpperCase()).join(" · ")}`}
            </div>
          )}
        </div>

        {/* right column: brand + stats + hashtag */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            height: 558,
            justifyContent: "space-between",
            paddingLeft: 44,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                letterSpacing: 6,
                color: "#e0bd57",
              }}
            >
              NOBLOCKS PLAY
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 10,
                fontSize: manager.username.length > 12 ? 40 : 52,
                letterSpacing: 2,
                color: "#ffffff",
              }}
            >
              {manager.username.toUpperCase()}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 6,
                fontSize: 23,
                letterSpacing: 2,
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {team.matchday.display_name.toUpperCase()}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 96, lineHeight: 1, color: "#e7c55e" }}>
                {team.points}
              </span>
              <span
                style={{
                  marginLeft: 16,
                  fontSize: 30,
                  letterSpacing: 1,
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                PTS
              </span>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 10,
                fontSize: 22,
                letterSpacing: 1,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              {`${manager.total_points} TOTAL${manager.rank != null ? ` · RANK #${manager.rank}` : ""}`}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 32,
                letterSpacing: 1,
                color: "#e7c55e",
              }}
            >
              #NoblocksPlay
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 14,
                backgroundImage: "linear-gradient(160deg, #ecd276, #c3a038)",
                fontSize: 22,
                letterSpacing: 1,
                color: INK,
              }}
            >
              600 USDC IN PRIZES
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: 20,
                fontSize: 22,
                color: "rgba(255,255,255,0.65)",
              }}
            >
              noblocks.xyz/play
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Anton", data: anton, style: "normal", weight: 400 }],
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}

/**
 * GET /api/play/og — share card for Noblocks Play (F-13): the FUT gold card
 * with the manager's stats on a dark backdrop.
 * Query: username, rank, points, refs (activated referrals), code, and
 * layout — "wide" (1200×630, link previews / desktop), "card" (640×960,
 * portrait: just the shield, big — the mobile presentation) or "squad"
 * (1200×630 squad snapshot for /play/manager/[username] link unfurls).
 * Public route, rate-limited — gated by the feature flag.
 */
export const GET = withRateLimit(async (request: NextRequest) => {
  if (!config.fantasyEnabled) {
    return Response.json(
      { success: false, error: "Noblocks Play is not available" },
      { status: 404 },
    );
  }

  const { searchParams } = request.nextUrl;

  if (searchParams.get("layout") === "squad") {
    try {
      return await squadImage(
        searchParams.get("username") ?? "",
        await loadAnton(),
      );
    } catch (error) {
      console.error("[play] squad og render failed:", error);
      return Response.json(
        { success: false, error: "Failed to render squad card" },
        { status: 500 },
      );
    }
  }

  const username = sanitizeUsername(searchParams.get("username"));
  const rank = sanitizeNumber(searchParams.get("rank"));
  const points = sanitizeNumber(searchParams.get("points"));
  const refs = sanitizeNumber(searchParams.get("refs"));
  const code = sanitizeCode(searchParams.get("code"));
  const initials = username.slice(0, 2).toUpperCase();

  const [anton, cardArt] = await Promise.all([loadAnton(), loadGoldCard()]);
  const photo = generateAvatar(username, searchParams.get("style"));

  const stat = (value: string, label: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        width: 130,
      }}
    >
      <span style={{ fontSize: 44, color: INK }}>{value}</span>
      <span
        style={{
          marginLeft: 9,
          fontSize: 28,
          letterSpacing: 2,
          color: INK_SOFT,
        }}
      >
        {label}
      </span>
    </div>
  );

  const layout =
    searchParams.get("layout") === "card" ? "card" : "wide";

  const card = (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_W,
        height: CARD_H,
      }}
    >
      {/* ambient glow behind the card */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: -60,
          left: -80,
          width: CARD_W + 160,
          height: CARD_H + 120,
          backgroundImage:
            "radial-gradient(circle at 50% 45%, rgba(231,197,94,0.30) 0%, rgba(231,197,94,0.10) 45%, rgba(231,197,94,0) 70%)",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cardArt}
        alt=""
        width={CARD_W}
        height={CARD_H}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
        }}
      />

      {/* rating column */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 64,
          left: 40,
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 88,
            lineHeight: 0.9,
            color: INK,
          }}
        >
          {rank}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 4,
            fontSize: 20,
            letterSpacing: 2,
            color: INK,
          }}
        >
          MGR
        </div>
        <div
          style={{
            display: "flex",
            width: 54,
            height: 3,
            marginTop: 12,
            backgroundColor: "rgba(59,45,14,0.4)",
          }}
        />
      </div>

      {/* portrait: faded into the gold */}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          width={PHOTO.width}
          height={PHOTO.height}
          style={{
            position: "absolute",
            ...PHOTO,
            objectFit: "cover",
            objectPosition: "center 20%",
            maskImage: PHOTO_MASK,
          }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            position: "absolute",
            ...PHOTO,
            alignItems: "center",
            justifyContent: "center",
            fontSize: 128,
            color: "rgba(59,45,14,0.82)",
          }}
        >
          {initials}
        </div>
      )}
      {/* gold tint wash OVER the photo (ref technique): edges shade into
          the card's gold before the mask fades them, so the photo's white
          background never reads as a halo. Same mask as the photo. */}
      {photo && (
        <div
          style={{
            display: "flex",
            position: "absolute",
            ...PHOTO,
            backgroundImage:
              "radial-gradient(ellipse 72% 76% at 52% 40%, rgba(233,208,120,0) 46%, rgba(233,208,120,0.24) 78%, rgba(178,142,53,0.44) 100%)",
            maskImage: PHOTO_MASK,
          }}
        />
      )}

      {/* name banner */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 300,
          left: 42,
          width: CARD_W - 84,
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            padding: "4px 0",
            fontSize: username.length > 12 ? 34 : 44,
            letterSpacing: 3,
            color: INK,
          }}
        >
          {username.toUpperCase()}
        </div>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 2,
            backgroundColor: "rgba(59,45,14,0.35)",
          }}
        />
      </div>

      {/* stats */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 388,
          left: 42,
          width: CARD_W - 84,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {stat(points, "PTS")}
        <div
          style={{
            display: "flex",
            width: 2,
            height: 44,
            backgroundColor: "rgba(59,45,14,0.35)",
          }}
        />
        {stat(refs === "—" ? "0" : refs, "REF")}
      </div>

      {/* footer plate (above the taper) */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 460,
          left: 0,
          width: CARD_W,
          justifyContent: "center",
          fontSize: 17,
          letterSpacing: 5,
          color: INK_SOFT,
        }}
      >
        NOBLOCKS PLAY
      </div>
    </div>
  );

  if (layout === "card") {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            backgroundImage:
              "radial-gradient(circle at 50% 42%, #201a0b 0%, #100d06 55%, #0a0804 100%)",
            fontFamily: "Anton",
          }}
        >
          <div style={{ display: "flex", transform: "scale(1.45)" }}>{card}</div>
          <div
            style={{
              display: "flex",
              position: "absolute",
              bottom: 26,
              fontSize: 22,
              letterSpacing: 1,
              color: "#e7c55e",
            }}
          >
            {code
              ? `600 USDC IN PRIZES · noblocks.xyz?ref=${code}`
              : "600 USDC IN PRIZES · noblocks.xyz/play"}
          </div>
        </div>
      ),
      {
        width: 640,
        height: 960,
        fonts: [{ name: "Anton", data: anton, style: "normal", weight: 400 }],
        headers: { "Cache-Control": CACHE_CONTROL },
      },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          backgroundImage:
            "radial-gradient(circle at 26% 45%, #201a0b 0%, #100d06 50%, #0a0804 100%)",
          padding: "45px 72px",
          fontFamily: "Anton",
        }}
      >
        {card}

        {/* right column: brand + invite */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            height: CARD_H,
            justifyContent: "space-between",
            paddingLeft: 80,
            paddingTop: 10,
            paddingBottom: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                letterSpacing: 8,
                color: "#e0bd57",
              }}
            >
              MANAGER CARD
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 12,
                fontSize: 66,
                letterSpacing: 2,
                color: "#ffffff",
              }}
            >
              NOBLOCKS PLAY
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 8,
                fontSize: 27,
                letterSpacing: 2,
                color: "rgba(255,255,255,0.55)",
              }}
            >
              WORLD CUP 2026 FANTASY LEAGUE
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span
                style={{
                  fontSize: 108,
                  color: "#e7c55e",
                  lineHeight: 1,
                }}
              >
                {`#${rank}`}
              </span>
              <span
                style={{
                  marginLeft: 22,
                  fontSize: 36,
                  letterSpacing: 1,
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                ON THE LEADERBOARD
              </span>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: 27,
                letterSpacing: 1,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              THINK YOU CAN DO BETTER?
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                padding: "12px 24px",
                borderRadius: 14,
                backgroundImage: "linear-gradient(160deg, #ecd276, #c3a038)",
                fontSize: 27,
                letterSpacing: 1,
                color: INK,
              }}
            >
              600 USDC IN PRIZES
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: 24,
                fontSize: 26,
                color: "rgba(255,255,255,0.65)",
              }}
            >
              {code ? `noblocks.xyz?ref=${code}` : "noblocks.xyz/play"}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Anton", data: anton, style: "normal", weight: 400 }],
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
});
