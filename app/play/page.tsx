"use client";

/**
 * /play campaign landing: hero, how it works, top-5 leaderboard preview
 * and the join flow (Privy login, then the username modal).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import {
  ArrowRight01Icon,
  FootballIcon,
  UserGroupIcon,
} from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import { JoinModal } from "@/app/components/play/JoinModal";
import { LeaderboardTable } from "@/app/components/play/LeaderboardTable";
import { useJoinStatus, useLeaderboard } from "@/app/components/play/hooks";
import {
  ErrorState,
  PlayCard,
  Skeleton,
  primaryButtonClasses,
} from "@/app/components/play/ui";

const ASSET = (name: string) => `/images/play-promo/${name}`;
const HERO_PILL_BUTTON =
  "inline-flex min-h-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-semibold text-text-body transition-transform active:scale-[0.98] dark:bg-white dark:text-text-body";
// The desktop banner is a fixed-aspect box whose headline, body and gaps are all
// sized in cqw; these two buttons were its only fixed-px elements. At text-sm
// with px-6 they needed ~308px side by side but the text column is only 35.34%
// (~287px at the 812px design width), so the row wrapped to two lines and the
// second button spilled through the banner's bottom edge — worse the narrower
// the screen, since the box height shrank while the buttons did not. Sizing them
// in cqw too keeps the pair on one line at every container width.
const HERO_DESKTOP_BUTTON_SIZING =
  "px-[2.1cqw] py-[1.15cqw] text-[1.6cqw]";
const HERO_DESKTOP_PRIMARY_BUTTON =
  `inline-flex min-h-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-text-body ${HERO_DESKTOP_BUTTON_SIZING} font-semibold text-lavender-100 transition-transform hover:bg-text-body/90 active:scale-[0.98] dark:bg-black dark:text-lavender-100 dark:hover:bg-black/90`;
const HERO_SECONDARY_BUTTON =
  `inline-flex min-h-0 items-center justify-center whitespace-nowrap rounded-full bg-white/10 ${HERO_DESKTOP_BUTTON_SIZING} font-semibold text-white transition-colors hover:bg-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20`;
const BOTTOM_CTA_SECTION =
  "relative overflow-hidden rounded-3xl bg-text-body dark:bg-surface-overlay";
const BOTTOM_CTA_SCRIM = "pointer-events-none absolute inset-0 z-0 bg-text-body/70 dark:bg-surface-overlay/70";
const BOTTOM_CTA_HEADING = "text-white dark:text-white";
const BOTTOM_CTA_BODY = "text-white/90 dark:text-white/80";
const BOTTOM_CTA_BUTTON =
  "flex items-center justify-center gap-1 rounded-full bg-white font-semibold text-text-body transition-transform active:scale-[0.98] dark:bg-white dark:text-text-body";
const BOTTOM_CTA_WATERMARK =
  "pointer-events-none absolute z-0 object-contain opacity-40 dark:opacity-25";

// Seven PL player photos side by side. Each photo frames its subject
// differently, so `height` zooms and `top`/`faceX` shift it until every face
// sits at the same height across the row.
const HERO_PLAYERS = [
  { src: ASSET("hero-player-1.png"), height: "105%", top: "-3%", faceX: "-67%" },
  { src: ASSET("hero-player-2.png"), height: "126%", top: "-4%", faceX: "-48%" },
  { src: ASSET("hero-player-3.png"), height: "107%", top: "-5%", faceX: "-49%" },
  { src: ASSET("hero-player-4.png"), height: "133%", top: "-9%", faceX: "-49%" },
  { src: ASSET("hero-player-5.png"), height: "147%", top: "-1%", faceX: "-53%" },
  { src: ASSET("hero-player-6.png"), height: "153%", top: "-21%", faceX: "-41%" },
  { src: ASSET("hero-player-7.png"), height: "104%", top: "-1%", faceX: "-61%" },
];

// Every star photo used across the campaign (hero collage + this section) —
// each side of the bottom CTA cycles through all of them.
const CTA_PHOTOS = [
  ASSET("mbappe.png"),
  ASSET("bellingham.png"),
  ASSET("kane.png"),
  ASSET("messi-2.png"),
  ASSET("olise-3.png"),
  ASSET("pickford.png"),
  ASSET("hakimi.png"),
  ASSET("haaland.png"),
  ASSET("dembele.png"),
  ASSET("yamal.png"),
  ASSET("williams.png"),
  ASSET("grimaldo.png"),
  ASSET("odeergard.png"),
  ASSET("enzo.png"),
  ASSET("lukaku.png"),
  ASSET("kevin.png"),
  ASSET("doku.png"),
  ASSET("akanji.png"),
];
const CTA_ROTATE_MS = 3000;

/** Next index: never any index in `forbidden` (current self, other side, other
 * side's previous — so a side can't pick what the opposite just left). */
function pickNextCtaIndex(current: number, forbidden: number[]): number {
  const n = CTA_PHOTOS.length;
  if (n <= 1) return current;
  const banned = new Set(forbidden);
  let pool = Array.from({ length: n }, (_, i) => i).filter((i) => !banned.has(i));
  if (pool.length === 0) {
    pool = Array.from({ length: n }, (_, i) => i).filter((i) => i !== current);
  }
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Keeps left/right CTA photos in sync: staggered ticks, no overlap, no
 * immediate repeat on either side, and neither side may show what the other
 * just finished. */
function usePairedCtaPhotoIndices() {
  const n = CTA_PHOTOS.length;
  const [indices, setIndices] = useState(() => ({
    left: 0,
    right: n > 1 ? 1 : 0,
    prevLeft: null as number | null,
    prevRight: null as number | null,
  }));

  useEffect(() => {
    const advanceLeft = () =>
      setIndices((prev) => {
        const forbidden = [prev.left, prev.right];
        if (prev.prevRight !== null) forbidden.push(prev.prevRight);
        return {
          ...prev,
          prevLeft: prev.left,
          left: pickNextCtaIndex(prev.left, forbidden),
        };
      });

    const advanceRight = () =>
      setIndices((prev) => {
        const forbidden = [prev.right, prev.left];
        if (prev.prevLeft !== null) forbidden.push(prev.prevLeft);
        return {
          ...prev,
          prevRight: prev.right,
          right: pickNextCtaIndex(prev.right, forbidden),
        };
      });

    const half = CTA_ROTATE_MS / 2;
    let leftInterval: ReturnType<typeof setInterval> | null = null;
    let rightInterval: ReturnType<typeof setInterval> | null = null;

    const leftTimeout = setTimeout(() => {
      advanceLeft();
      leftInterval = setInterval(advanceLeft, CTA_ROTATE_MS);
    }, 0);

    const rightTimeout = setTimeout(() => {
      advanceRight();
      rightInterval = setInterval(advanceRight, CTA_ROTATE_MS);
    }, half);

    return () => {
      clearTimeout(leftTimeout);
      clearTimeout(rightTimeout);
      if (leftInterval) clearInterval(leftInterval);
      if (rightInterval) clearInterval(rightInterval);
    };
  }, [n]);

  return indices;
}

/** One side of the bottom CTA: crossfade for the photo at `index`. */
const RotatingPhoto = ({
  index,
  className = "",
  style,
  imageClassName = "",
}: {
  index: number;
  className?: string;
  style?: CSSProperties;
  imageClassName?: string;
}) => {
  const photo = CTA_PHOTOS[index % CTA_PHOTOS.length];

  return (
    <div aria-hidden className={`absolute ${className} h-full w-[318px]`} style={style}>
      <AnimatePresence mode="wait">
        <motion.img
          key={photo}
          src={photo}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0.4 }}
          transition={{ duration: 0.75, ease: "easeInOut" }}
          className={` object-cover ${imageClassName}`}
          style={{ aspectRatio: "318:318" }}
        />
      </AnimatePresence>
    </div>
  );
};

function PairedCtaRotatingPhotos() {
  const { left, right } = usePairedCtaPhotoIndices();
  return (
    <>
      <RotatingPhoto
        index={left}
        className="z-20 absolute"
        style={{ left: "0", top: "1rem" }}
      />
      <RotatingPhoto
        index={right}
        className="z-20 absolute"
        style={{ right: "-2rem", top: "1rem" }}
      />
    </>
  );
}

const JoinCTA = ({
  className = "",
  buttonClassName = primaryButtonClasses,
}: {
  className?: string;
  /** Overrides the button/link's own look (defaults to primaryButtonClasses)
   * — lets callers restyle the CTA without fighting a mix of appended
   * Tailwind classes that touch the same properties. */
  buttonClassName?: string;
}) => {
  const { ready, authenticated } = usePrivy();
  const { joined, isLoading } = useJoinStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const openAfterLogin = useRef(false);

  const { login } = useLogin({
    onComplete: () => {
      if (openAfterLogin.current) {
        openAfterLogin.current = false;
        setModalOpen(true);
      }
    },
  });

  if (!ready || isLoading) {
    return <Skeleton className={`h-11 w-40 ${className}`} />;
  }

  if (joined) {
    return (
      <Link
        href="/play/team"
        className={`${buttonClassName} inline-flex items-center gap-2 ${
          // Callers passing their own look (the hero banners) size their own
          // padding; only the default button needs this widening.
          buttonClassName === primaryButtonClasses ? "px-8 py-3" : ""
        } ${className}`}
      >
        My Team
        <ArrowRight01Icon className="size-4" />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!authenticated) {
            openAfterLogin.current = true;
            login();
          } else {
            setModalOpen(true);
          }
        }}
        className={`${buttonClassName} ${className}`}
      >
        Join the league
      </button>
      <JoinModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

const LeaderboardPreview = () => {
  const { data, isPending, isError, refetch } = useLeaderboard(1);

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        message="Couldn't load the leaderboard."
        onRetry={() => refetch()}
      />
    );
  }
  const rows = (data?.rows ?? []).slice(0, 5);
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-light px-6 py-8 text-center text-sm text-text-secondary dark:border-white/10 dark:text-white/50">
        No managers on the board yet. Join now and claim the top spot.
      </p>
    );
  }
  return <LeaderboardTable rows={rows} compact />;
};

export default function PlayLandingPage() {
  useEffect(() => {
    trackEvent("play_landing_view");
  }, []);

  return (
    <div className="space-y-10 md:space-y-20 md:mt-20">
      {/* Hero — mobile unchanged; md+ uses Figma node 2573-110647 below. */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-lavender-500 px-6 py-10 text-white sm:px-10 sm:py-14 md:hidden dark:bg-lavender-600"
      >
         <img
            src={ASSET("vector7984.svg")}
            alt=""
            className="pointer-events-none absolute scale-125"
            style={{ left: "-1.18%", top: "7.62%", width: "128.28%", height: "68.17%" }}
          />

        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-8 size-56 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Premier League 2026/27 · Gameweeks 1–38
          </p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl dark:text-white">
            Build your Premier League fantasy XI.
          </h1>
          <p className="max-w-xl text-sm text-white/80 sm:text-base dark:text-white/70">
            Pick a 15-man squad within £100m, score points every gameweek, and
            climb the global leaderboard. Free to play — create mini-leagues
            with friends.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <JoinCTA buttonClassName={HERO_PILL_BUTTON} />
            <Link href="/play/terms" className={`min-h-11 px-8 py-2.5 text-sm font-medium ${HERO_SECONDARY_BUTTON}`}>
              Read the rules
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Hero (Figma node 2573-110647). Self-contained here — doesn't import
          from PlayPromo.tsx, so it can't affect the certified homepage
          modal/banner. Mobile hero above is unchanged. */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative hidden md:block"
        style={{ containerType: "inline-size" }}
      >
        <div
          className="relative w-full overflow-hidden rounded-3xl bg-lavender-500 dark:bg-lavender-600"
          style={{ aspectRatio: "812 / 393" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute z-0 opacity-100 dark:opacity-80"
            style={{
              left: "39.49%",
              right: "22.17%",
              top: "-27.52%",
              bottom: "26.68%",
            }}
          >
            <img
              src={ASSET("pl-lion-watermark.svg")}
              alt=""
              className="absolute inset-0 size-full max-w-none"
            />
          </div>

          {/* Player collage — seven photos side by side. */}
          <div
            aria-hidden
            className="pointer-events-none absolute z-[1] flex h-[74.55%] w-[53.20%] items-center"
            style={{
              left: "47.17%",
              top: "calc(50% + 1.02%)",
              transform: "translateY(-50%)",
            }}
          >
            {HERO_PLAYERS.map(({ src, height, top, faceX }) => (
              <div
                key={src}
                className="relative h-full min-w-0 flex-1 overflow-hidden bg-white dark:bg-white"
              >
                <img
                  src={src}
                  alt=""
                  className="pointer-events-none absolute left-1/2 max-w-none"
                  style={{ height, top, transform: `translateX(${faceX})` }}
                />
              </div>
            ))}
          </div>

          <div
            className="absolute z-[2] flex flex-col gap-[4.22cqw]"
            style={{
              left: "6.53%",
              top: "21.37%",
              width: "35.34%",
            }}
          >
            <div className="flex flex-col gap-[2.71cqw]">
              <h1
                className="font-bold text-white dark:text-white"
                style={{
                  fontSize: "4.75cqw",
                  lineHeight: 0.861,
                  letterSpacing: "-0.332cqw",
                }}
              >
                <span>Build your Premier League </span>
                <span className="font-light italic">fantasy XI.</span>
              </h1>
              <p
                className="text-white/90 dark:text-white/80"
                style={{
                  maxWidth: "91.6%",
                  fontSize: "1.392cqw",
                  lineHeight: 1.351,
                  letterSpacing: "-0.028cqw",
                }}
              >
                Pick a 15-man squad within £100m, score points every gameweek,
                and climb the global leaderboard. Free to play — create
                mini-leagues with friends.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-[1.14cqw]">
              <JoinCTA buttonClassName={HERO_DESKTOP_PRIMARY_BUTTON} />
              <Link href="/play/terms" className={HERO_SECONDARY_BUTTON}>
                Read the rules
              </Link>
            </div>
          </div>
        </div>
      </motion.section>

      {/* How it works */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-body dark:text-white">
          How it works
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlayCard className="space-y-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender-100 dark:bg-lavender-500/15">
              <FootballIcon className="size-5 text-lavender-600 dark:text-lavender-300" />
            </div>
            <h3 className="text-sm font-semibold text-text-body dark:text-white">
              Build your squad and score points
            </h3>
            <p className="text-sm text-text-secondary dark:text-white/50">
              Pick 15 players within £100m: 2 goalkeepers, 5 defenders,
              5 midfielders and 3 forwards (max 3 per club). Set your starting
              XI and captain before each gameweek deadline. Official FPL-style
              scoring across all 38 gameweeks.
            </p>
          </PlayCard>
          <PlayCard className="space-y-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender-100 dark:bg-lavender-500/15">
              <UserGroupIcon className="size-5 text-lavender-600 dark:text-lavender-300" />
            </div>
            <h3 className="text-sm font-semibold text-text-body dark:text-white">
              Play with friends in mini-leagues
            </h3>
            <p className="text-sm text-text-secondary dark:text-white/50">
              Create or join a private mini-league and compete week to week with
              friends. Free transfers bank up to 5; extras cost 4 points each.
            </p>
          </PlayCard>
        </div>
      </section>

      {/* Leaderboard preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-body dark:text-white">
            Top of the table
          </h2>
          <Link
            href="/play/leaderboard"
            className="flex items-center gap-1 text-sm font-medium text-lavender-500 hover:text-lavender-600"
          >
            Full leaderboard
            <ArrowRight01Icon className="size-4" />
          </Link>
        </div>
        <LeaderboardPreview />
      </section>

      {/* Bottom CTA — mobile: one rotating photo + stacked text, normal
          flow (no Figma mobile frame exists for this section either). */}
      <section className={`${BOTTOM_CTA_SECTION} relative flex h-[323px] flex-col items-center justify-center gap-4 px-6 py-8 text-center md:hidden`}>
        <img
          src={ASSET("pl-lion-watermark.svg")}
          alt=""
          aria-hidden
          className={`${BOTTOM_CTA_WATERMARK} left-1/2 top-1/2 h-[12.5rem] w-[28%] -translate-x-1/2 -translate-y-1/2`}
        />
        <div aria-hidden className={BOTTOM_CTA_SCRIM} />

        <h2
          className={`absolute z-10 mb-4 flex items-center justify-center text-center font-bold ${BOTTOM_CTA_HEADING}`}
          style={{
            left: "19.13%",
            top: "14.46%",
            width: "60.00%",
            height: "24.42%",
            fontSize: "7.638cqw",
            lineHeight: 0.901,
            letterSpacing: "-0.2547cqw",
          }}
        >
          Ready to play your way to the top?
        </h2>

        <p
          className={`absolute z-10 mb-4 flex items-center justify-center text-center ${BOTTOM_CTA_BODY}`}
          style={{
            left: "6.64%",
            top: "47.84%",
            width: "85.85%",
            height: "11.51%",
            fontSize: "4.499cqw",
            lineHeight: 1.351,
            letterSpacing: "-0.03cqw",
          }}
        >
          Joining takes less than a minute. Pick a username, build your
          squad, and you&apos;re on the board.
        </p>

        <div
          className="absolute z-10"
          style={{ left: "15.47%", top: "71.22%", width: "65.06%", height: "12.59%" }}
        >
          <JoinCTA
            className="size-full"
            buttonClassName={`${BOTTOM_CTA_BUTTON} size-full text-[3.304cqw]`}
          />
        </div>
      </section>

      {/* Bottom CTA (Figma node 2136-101604), md+. Self-contained — doesn't
          import from PlayPromo.tsx. */}
      <section
        className={`${BOTTOM_CTA_SECTION} relative hidden h-[328px] w-full md:block`}
        style={{ aspectRatio: "812 / 278", containerType: "inline-size" }}
      >
        <img
          src={ASSET("pl-lion-watermark.svg")}
          alt=""
          aria-hidden
          className={BOTTOM_CTA_WATERMARK}
          style={{ left: "42%", top: "8%", width: "18%", height: "84%" }}
        />
        <div aria-hidden className={BOTTOM_CTA_SCRIM} />

        <h2
          className={`absolute z-10 flex items-center justify-center text-center font-bold ${BOTTOM_CTA_HEADING}`}
          style={{
            left: "33.13%",
            top: "24.46%",
            width: "33.00%",
            height: "19.42%",
            fontSize: "3.638cqw",
            lineHeight: 0.901,
            letterSpacing: "-0.2547cqw",
          }}
        >
          Ready to play your way to the top?
        </h2>

        <p
          className={`absolute z-10 flex items-center justify-center text-center ${BOTTOM_CTA_BODY}`}
          style={{
            left: "32.64%",
            top: "47.84%",
            width: "34.85%",
            height: "11.51%",
            fontSize: "1.499cqw",
            lineHeight: 1.351,
            letterSpacing: "-0.03cqw",
          }}
        >
          Joining takes less than a minute. Pick a username, build your
          squad, and you&apos;re on the board.
        </p>

        <div
          className="absolute z-10"
          style={{ left: "35.47%", top: "71.22%", width: "29.06%", height: "12.59%" }}
        >
          <JoinCTA
            className="size-full"
            buttonClassName={`${BOTTOM_CTA_BUTTON} size-full text-[1.304cqw]`}
          />
        </div>

        <PairedCtaRotatingPhotos />
      </section>
    </div>
  );
}
