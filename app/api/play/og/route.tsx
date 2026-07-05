import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { createAvatar } from "@dicebear/core";
import { bigSmile, openPeeps } from "@dicebear/collection";
import config from "@/app/lib/config";

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

/**
 * GET /api/play/og — share card for Noblocks Play (F-13): the FUT gold card
 * with the manager's stats on a dark backdrop.
 * Query: username, rank, points, refs (activated referrals), code, and
 * layout — "wide" (1200×630, link previews / desktop) or "card" (640×960,
 * portrait: just the shield, big — the mobile presentation).
 * Public route (not in the middleware matcher) — gated by the feature flag.
 */
export async function GET(request: NextRequest) {
  if (!config.fantasyEnabled) {
    return Response.json(
      { success: false, error: "Noblocks Play is not available" },
      { status: 404 },
    );
  }

  const { searchParams } = request.nextUrl;
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
              ? `300 USDC IN PRIZES · noblocks.xyz?ref=${code}`
              : "300 USDC IN PRIZES · noblocks.xyz/play"}
          </div>
        </div>
      ),
      {
        width: 640,
        height: 960,
        fonts: [{ name: "Anton", data: anton, style: "normal", weight: 400 }],
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
              300 USDC IN PRIZES
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
    },
  );
}
