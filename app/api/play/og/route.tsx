import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { matchMemoji } from "dapvatar";
import config from "@/app/lib/config";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { getPublicManagerTeam } from "@/app/lib/fantasy/server";
import { clubJerseyDataUri } from "@/app/lib/fantasy/club-kits";
import type { Position } from "@/app/lib/fantasy/types";

const CACHE_CONTROL = "public, max-age=60, s-maxage=300";
/** Share-card tagline — no fixed prize amounts; promos are marketing-led. */
const PLAY_CHIP = "NOBLOCKS PLAY";

/** Clamp a username to the on-card format: ≤20 chars, alnum/underscore only. */
const sanitizeUsername = (value: string | null): string => {
  const cleaned = (value ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  return cleaned || "player";
};

/** Format a verified non-negative stat for on-card display. */
const formatDisplayStat = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  return String(Math.min(Math.trunc(value), 999_999_999));
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
 * Manager portrait via dapvatar memoji — deterministic from username.
 * Reads the PNG from the package assets (no CDN) so OG rendering stays offline.
 * `style` query is accepted for back-compat but ignored (single catalog).
 */
const avatarCache = new Map<string, string>();
async function generateAvatar(
  username: string,
  _style: string | null,
): Promise<string | null> {
  const seed = username.toLowerCase() || "noblocks-manager";
  const match = matchMemoji({ seed, posture: "happy" });
  const assetPath = match.selectedPosture.assetPath;
  if (!assetPath) return null;
  const cached = avatarCache.get(assetPath);
  if (cached) return cached;
  try {
    const buf = await readFile(
      path.join(process.cwd(), "node_modules/dapvatar/assets", assetPath),
    );
    const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
    avatarCache.set(assetPath, dataUri);
    return dataUri;
  } catch (error) {
    console.warn("[play] dapvatar asset read failed:", assetPath, error);
    return null;
  }
}

type OgLayout = "wide" | "card" | "squad";

/** Branded placeholder when a manager has no public profile or shareable squad. */
function ogNotFoundImage(anton: Buffer, layout: OgLayout, message: string) {
  const copy =
    layout === "card"
      ? { width: 640, height: 960 }
      : { width: 1200, height: 630 };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage:
            "radial-gradient(circle at 50% 42%, #201a0b 0%, #100d06 55%, #0a0804 100%)",
          fontFamily: "Anton",
          padding: 48,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: 6,
            color: "#e0bd57",
          }}
        >
          NOBLOCKS PLAY
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 42,
            letterSpacing: 2,
            color: "#ffffff",
            textAlign: "center",
          }}
        >
          {message.toUpperCase()}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 22,
            letterSpacing: 1,
            color: "rgba(255,255,255,0.55)",
            textAlign: "center",
          }}
        >
          SET A USERNAME AND JOIN THE LEAGUE TO SHARE
        </div>
      </div>
    ),
    {
      ...copy,
      fonts: [{ name: "Anton", data: anton, style: "normal", weight: 400 }],
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}

// Portrait window on the card (ref: gitfut's geometry) + its fade mask.
const PHOTO = { top: 62, right: 16, width: 246, height: 258 };
const PHOTO_MASK =
  "radial-gradient(ellipse 66% 88% at 52% 55%, #000 56%, transparent 90%)";

// ─── Squad snapshot (layout=squad) ───────────────────────────────────────────

const POS_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

const lastName = (name: string) => name.split(" ").slice(-1)[0] ?? name;

/** Budget for pulling one headshot before the card falls back to the kit. */
const HEADSHOT_TIMEOUT_MS = 2_500;

interface PlayerMark {
  src: string;
  /** Headshots crop round and cover; kit SVGs are drawn to fit as-is. */
  isPhoto: boolean;
}

/**
 * Resolves each XI slot to a headshot when photos are enabled, else the
 * stylized club kit.
 *
 * Headshots are fetched here and inlined as data URIs rather than handed to
 * Satori as remote URLs: Satori would fetch them itself during render, and a
 * single dead provider URL would throw and take the entire card down. Fetching
 * them up front lets one bad URL degrade to that player's kit instead. All
 * requests run in parallel and are individually bounded.
 */
async function loadPlayerMarks(
  players: { player_id: number; team_id: number; position: Position; photo_url: string | null }[],
): Promise<Map<number, PlayerMark>> {
  const marks = new Map<number, PlayerMark>();

  await Promise.all(
    players.map(async (p) => {
      const kit: PlayerMark = {
        src: clubJerseyDataUri(p.team_id || 0, p.position),
        isPhoto: false,
      };
      if (!p.photo_url) {
        marks.set(p.player_id, kit);
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEADSHOT_TIMEOUT_MS);
      try {
        const response = await fetch(p.photo_url, { signal: controller.signal });
        if (!response.ok) throw new Error(`headshot ${response.status}`);
        // A 200 carrying an HTML error page would otherwise be inlined as a
        // data: URI and marked isPhoto, skipping the kit fallback and handing
        // Satori something it cannot decode — the whole-card failure this
        // pre-fetch exists to avoid. The strict pattern (rather than a bare
        // startsWith) also keeps anything odd in the header out of the URI we
        // build from it.
        const mediaType = response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (!mediaType || !/^image\/[a-z0-9.+-]+$/.test(mediaType)) {
          throw new Error(`headshot media type ${mediaType ?? "missing"}`);
        }
        const body = Buffer.from(await response.arrayBuffer());
        marks.set(p.player_id, {
          src: `data:${mediaType};base64,${body.toString("base64")}`,
          isPhoto: true,
        });
      } catch {
        marks.set(p.player_id, kit);
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  return marks;
}

/**
 * 1200×630 squad snapshot: the XI on a pitch panel (player headshots when
 * photos_enabled, else stylized club kits), C/V badges, effective points +
 * manager stats.
 */
async function squadImage(usernameParam: string, anton: Buffer) {
  const manager = await getPublicManagerTeam(usernameParam);
  if (!manager?.team) {
    return ogNotFoundImage(anton, "squad", "No shareable squad yet");
  }
  const { team } = manager;

  const xi = team.players.filter((p) => p.slot <= 11);
  const bench = team.players.filter((p) => p.slot > 11);

  const marks = await loadPlayerMarks(xi);

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={(marks.get(p.player_id) ?? { src: "", isPhoto: false }).src}
          alt=""
          width={58}
          height={58}
          style={{
            width: 58,
            height: 58,
            // Headshots arrive as tall portraits on a light background: crop
            // them round and cover so they sit like the kit they replace.
            objectFit: marks.get(p.player_id)?.isPhoto ? "cover" : "contain",
            ...(marks.get(p.player_id)?.isPhoto
              ? { borderRadius: 29, backgroundColor: "rgba(255,255,255,0.9)" }
              : {}),
          }}
        />
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
              {PLAY_CHIP}
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
 * Query: username, layout ("wide" | "card" | "squad"), code (referral link only),
 * and optional style (ignored). Rank, points, and referral stats are resolved
 * server-side from getPublicManagerTeam — query params cannot forge them.
 * Public route, rate-limited — gated by the feature flag.
 */
export const GET = withRateLimitAndAnalytics(async (request: NextRequest) => {
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

  const layoutParam = searchParams.get("layout");
  const layout: "wide" | "card" = layoutParam === "card" ? "card" : "wide";
  const code = sanitizeCode(searchParams.get("code"));

  try {
    const anton = await loadAnton();
    const manager = await getPublicManagerTeam(searchParams.get("username") ?? "");
    if (!manager) {
      return ogNotFoundImage(anton, layout, "Manager not found");
    }

    const username = sanitizeUsername(manager.username);
    const rank = formatDisplayStat(manager.rank);
    const points = formatDisplayStat(manager.total_points);
    const refs = formatDisplayStat(manager.activated_referrals);
    const initials = username.slice(0, 2).toUpperCase();

    const [cardArt, photo] = await Promise.all([
      loadGoldCard(),
      generateAvatar(username, searchParams.get("style")),
    ]);

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
              ? `${PLAY_CHIP} · noblocks.xyz?ref=${code}`
              : `${PLAY_CHIP} · noblocks.xyz/play`}
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
              PREMIER LEAGUE FANTASY
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
              {PLAY_CHIP}
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
  } catch (error) {
    console.error("[play] manager og render failed:", error);
    return Response.json(
      { success: false, error: "Failed to render manager card" },
      { status: 500 },
    );
  }
});
