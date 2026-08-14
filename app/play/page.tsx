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
import { CampaignEnded } from "@/app/components/play/CampaignEnded";
import { JoinModal } from "@/app/components/play/JoinModal";
import { LeaderboardTable } from "@/app/components/play/LeaderboardTable";
import { useJoinStatus, useLeaderboard } from "@/app/components/play/hooks";
import {
  ErrorState,
  PlayCard,
  Skeleton,
  primaryButtonClasses,
} from "@/app/components/play/ui";
import config from "@/app/lib/config";

const ASSET = (name: string) => `/images/play-promo/${name}`;
const HERO_PILL_BUTTON =
  "inline-flex min-h-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-transform active:scale-[0.98]";

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
        className={`${buttonClassName} inline-flex items-center gap-2  px-8 py-3 ${className}`}
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
    if (!config.fantasyCampaignEnded) {
      trackEvent("play_landing_view");
    }
  }, []);

  if (config.fantasyCampaignEnded) {
    return <CampaignEnded />;
  }

  return (
    <div className="space-y-10 md:space-y-20 md:mt-20">
      {/* Hero — mobile keeps the previous plain gradient design (no Figma
          mobile frame exists for this hero); md+ gets the new Figma design
          (node 2136-91897) below. */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-[#8E85FF] px-6 py-10 text-white sm:px-10 sm:py-14 md:hidden"
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
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            Build your Premier League fantasy XI.
          </h1>
          <p className="max-w-xl text-sm text-white/80 sm:text-base">
            Pick a 15-man squad within £100m, score points every gameweek, and
            climb the global leaderboard. Free to play — create mini-leagues
            with friends.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <JoinCTA buttonClassName={HERO_PILL_BUTTON} />
            <Link
              href="/play/terms"
              className="min-h-11 rounded-full bg-lavender-400/20 px-8 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Read the rules
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Hero (Figma node 2136-91897). Self-contained here — doesn't import
          from PlayPromo.tsx, so it can't affect the certified homepage
          modal/banner. */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative hidden md:block"
        style={{ containerType: "inline-size" }}
      >
        {/* Clipped layer: bg color + swoosh/texture + copy + buttons. */}
        <div
          className="relative w-full overflow-hidden rounded-3xl bg-[#8E85FF]"
          style={{ aspectRatio: "812 / 393" }}
        >
          <img
            src={ASSET("vector7984.svg")}
            alt=""
            className="pointer-events-none absolute scale-125"
            style={{ left: "-1.18%", top: "7.62%", width: "128.28%", height: "68.17%" }}
          />

          <h1
            className="absolute font-bold text-[#F5F5F5]"
            style={{
              left: "9.24%",
              top: "27.40%",
              width: "37.32%",
              height: "27.48%",
              fontSize: "5.116cqw",
              lineHeight: 0.861,
              letterSpacing: "-0.358cqw",
            }}
          >
            Build your Premier League fantasy XI.
          </h1>

          <p
            className="absolute text-[#F5F5F5]"
            style={{
              left: "9.24%",
              top: "59.54%",
              width: "34.85%",
              height: "12.21%",
              fontSize: "1.499cqw",
              lineHeight: 1.351,
              letterSpacing: "-0.03cqw",
            }}
          >
            Pick a 15-man squad within £100m, score points every gameweek, and
            climb the global leaderboard. Free to play — create mini-leagues
            with friends.
          </p>

          {/* Content-sized (no fixed width): the buttons keep a fixed font
              size, so a %-width box compresses them when the sidebar
              expansion narrows the hero. */}
          <div
            className="absolute flex items-center gap-3"
            style={{ left: "8.50%", top: "77.86%", height: "8.91%" }}
          >
            <JoinCTA buttonClassName={HERO_PILL_BUTTON} />
            <Link
              href="/play/terms"
              className="inline-flex min-h-0 items-center justify-center whitespace-nowrap rounded-full bg-white/10 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              Read the rules
            </Link>
          </div>
        </div>

        {/* Player collage — sibling of the clipped card so it can bleed
            above/below the card edges (Ronaldo's boots extend past the
            bottom in the design) instead of being cropped by overflow-hidden. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 w-full"
          style={{ aspectRatio: "812 / 393" }}
        >
          <img
            src={ASSET("trophy.svg")}
            alt=""
            className="absolute object-auto"
            style={{ left: "56.90%", top: "-2.04%", width: "23.40%", height: "99.75%" }}
          />
          <img
            src={ASSET("olise-2.png")}
            alt=""
            className="absolute object-cover"
            style={{ left: "63.28%", top: "-20.30%", width: "29.78%", height: "120.75%" }}
          />
          <img
            src={ASSET("ronaldo-2.png")}
            alt=""
            className="absolute object-cover"
            style={{ left: "73.89%", top: "-0.76%", width: "25.15%", height: "137.50%" }}
          />
          <img
            src={ASSET("messi.png")}
            alt=""
            className="absolute object-cover"
            style={{ left: "41.80%", top: "7.33%", width: "58.10%", height: "92.88%" }}
          />
          
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
      <section className="relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl bg-surface-overlay px-6 py-8 text-center md:hidden h-[323px]">
        <img
          src={ASSET("trophy.svg")}
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-50 w-[20%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-40"
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-surface-overlay/70" />

        <h2
          className="absolute z-10 flex items-center justify-center text-center font-bold text-[#F5F5F5] mb-4"
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
          className="absolute z-10 flex items-center justify-center text-center text-[#F5F5F5] mb-4"
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
            buttonClassName="flex size-full items-center justify-center gap-1 rounded-full bg-white text-[3.304cqw] font-semibold text-black transition-transform active:scale-[0.98]"
          />
        </div>
      </section>

      {/* Bottom CTA (Figma node 2136-101604), md+. Self-contained — doesn't
          import from PlayPromo.tsx. */}
      <section
        className="relative hidden w-full h-[328px] overflow-hidden rounded-3xl bg-surface-overlay md:block"
        style={{ aspectRatio: "812 / 278", containerType: "inline-size" }}
      >
        <img
          src={ASSET("trophy.svg")}
          alt=""
          aria-hidden
          className="pointer-events-none absolute z-0 object-contain"
          style={{ left: "45%", top: "10%", width: "12.40%", height: "75.75%" }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-surface-overlay/70" />

        <h2
          className="absolute z-10 flex items-center justify-center text-center font-bold text-[#F5F5F5]"
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
          className="absolute z-10 flex items-center justify-center text-center text-[#F5F5F5]"
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
            buttonClassName="flex size-full items-center justify-center gap-1 rounded-full bg-white text-[1.304cqw] font-semibold text-black transition-transform active:scale-[0.98]"
          />
        </div>

        <PairedCtaRotatingPhotos />
      </section>
    </div>
  );
}
