"use client";

/**
 * Noblocks Play — interactive DEMO harness (/play-demo).
 *
 * Mounts the REAL /play pages against the in-browser DemoBackend by
 * intercepting window.fetch for /api/play/* (and the referral-data call)
 * while this component is mounted. Scenario presets swap the backend state
 * and reset a demo-scoped react-query cache, so every campaign phase can be
 * inspected without touching Supabase or API-Football.
 *
 * Auth note: the pages still use Privy for gating, so sign in via the main
 * navbar to exercise the joined scenarios — no requests leave the browser.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AlarmClockIcon,
  ArrowRightDoubleIcon,
  ChampionIcon,
  Forward01Icon,
  RotateClockwiseIcon,
  RotateLeft01Icon,
  TestTube01Icon,
  Tick02Icon,
  UserAdd01Icon,
} from "hugeicons-react";
import { DemoBackend, SCENARIOS, type DemoScenario } from "./backend";

import PlayLanding from "@/app/play/page";
import TeamPage from "@/app/play/team/page";
import LeaderboardPage from "@/app/play/leaderboard/page";
import RewardsPage from "@/app/play/rewards/page";
import { PlayHeader } from "../PlayShell";
import { fetchMatchday } from "../api";
import type { MatchdayResponse } from "../types";
import { Chip, PlayCard, secondaryButtonClasses } from "../ui";
import {
  FIXTURE_FINISHED_STATUSES,
  FIXTURE_LIVE_STATUSES,
} from "../types";

const TABS = ["Landing", "My Team", "Matchday", "Leaderboard", "Rewards"] as const;
type DemoTab = (typeof TABS)[number];

/** Small matchday panel (the real page reads its id from the URL params). */
const MatchdayPanel = ({ version }: { version: number }) => {
  const [data, setData] = useState<MatchdayResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMatchday(6)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (!data) return <PlayCard>Loading fixtures…</PlayCard>;
  return (
    <div className="space-y-2">
      {data.fixtures.map((f) => (
        <PlayCard key={f.provider_fixture_id}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-right">{f.home_team}</span>
            <span className="shrink-0 rounded-lg bg-background-neutral px-2 py-1 font-semibold tabular-nums dark:bg-white/10">
              {f.home_score != null ? `${f.home_score} – ${f.away_score}` : new Date(f.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="min-w-0 flex-1 truncate">{f.away_team}</span>
            <Chip
              tone={
                FIXTURE_LIVE_STATUSES.has(f.status)
                  ? "red"
                  : FIXTURE_FINISHED_STATUSES.has(f.status)
                    ? "lavender"
                    : undefined
              }
            >
              {f.status}
            </Chip>
          </div>
        </PlayCard>
      ))}
    </div>
  );
};

export const DemoShell = () => {
  const backendRef = useRef<DemoBackend | null>(null);
  const [scenario, setScenario] = useState<DemoScenario>("build");
  const [tab, setTab] = useState<DemoTab>("My Team");
  const [version, setVersion] = useState(0); // bump ⇒ remount + fresh cache
  const [mocked, setMocked] = useState(false);
  const [logTick, setLogTick] = useState(0);

  if (!backendRef.current) backendRef.current = new DemoBackend(scenario);

  // Install the fetch interceptor for the lifetime of the demo page.
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input.url,
        window.location.origin,
      );
      const handled = await backendRef.current!.handle(
        url,
        init ?? (typeof input === "object" && !(input instanceof URL) ? input : undefined),
      );
      if (handled) {
        setTimeout(() => setLogTick((t) => t + 1), 0);
        return handled;
      }
      return original(input as RequestInfo, init);
    };
    setMocked(true);
    return () => {
      window.fetch = original;
    };
  }, []);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 5_000 } },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario, version],
  );

  const switchScenario = (next: DemoScenario) => {
    backendRef.current = new DemoBackend(next);
    setScenario(next);
    setVersion((v) => v + 1);
    setTab(next === "fresh" || next === "username-taken" ? "Landing" : "My Team");
  };

  const runSim = (fn: () => void) => {
    fn();
    setVersion((v) => v + 1);
  };

  const meta = SCENARIOS[scenario];
  const backend = backendRef.current;
  const st = backend.state;
  const log = backend.log;
  void logTick;

  // One primary action per campaign phase — chaining them walks the entire
  // flow: build → lock → live games → finished → rollover → … → champion.
  const lifecycle = st.campaignComplete
    ? null
    : st.matchdayStatus === "upcoming" && !backend.locked
      ? {
          label: "Jump to round lock",
          Icon: ArrowRightDoubleIcon,
          run: () => backend.jumpToLock(),
        }
      : st.matchdayStatus === "finalizing"
        ? {
            label: "Roll over to next round",
            Icon: RotateClockwiseIcon,
            run: () => backend.rollover(),
          }
        : {
            label: "Advance sim 15'",
            Icon: Forward01Icon,
            run: () => backend.advance(),
          };

  if (!mocked) return null;

  return (
    <div className="min-h-dvh">
      <PlayHeader
        right={
          <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            DEMO
          </span>
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-20 pt-4 sm:px-6">
      <div className="rounded-2xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
        <TestTube01Icon className="mr-1 inline size-4 align-[-2px]" />
        <strong>Demo mode</strong> — every request is served by an
        in-browser simulator (real UI components + real validation/scoring
        engines; no network, no database). Sign in via the main navbar to use
        the joined scenarios.
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        {/* Scenario rail */}
        <div className="space-y-3">
          <PlayCard>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-white/40">
              Scenario
            </p>
            <div className="space-y-1">
              {(Object.keys(SCENARIOS) as DemoScenario[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchScenario(key)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    scenario === key
                      ? "bg-lavender-500 text-white"
                      : "text-text-body hover:bg-accent-gray dark:text-white/80 dark:hover:bg-white/5"
                  }`}
                >
                  {SCENARIOS[key].title}
                </button>
              ))}
            </div>
          </PlayCard>

          <PlayCard>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Chip tone="lavender">
                {backend.matchday.display_name} · {st.matchdayStatus}
                {st.matchdayStatus === "upcoming" && backend.locked ? " (locked)" : ""}
              </Chip>
              {st.campaignComplete && (
                <Chip tone="red">
                  <ChampionIcon className="mr-1 inline size-3.5 align-[-2px]" />
                  campaign complete
                </Chip>
              )}
            </div>
            <p className="text-sm font-medium text-text-body dark:text-white">
              {meta.title}
            </p>
            <p className="mt-1 text-xs text-text-secondary dark:text-white/60">
              {meta.blurb}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-text-secondary dark:text-white/60">
              {meta.checks.map((check) => (
                <li key={check} className="flex items-start gap-1.5">
                  <Tick02Icon className="mt-0.5 size-3 shrink-0" />
                  <span>{check}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {lifecycle && (
                <button
                  type="button"
                  onClick={() => runSim(lifecycle.run)}
                  className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
                >
                  <lifecycle.Icon className="size-4" />
                  {lifecycle.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => switchScenario(scenario)}
                className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
              >
                <RotateLeft01Icon className="size-4" />
                Reset scenario
              </button>
            </div>
            {st.campaignComplete && (
              <p className="mt-2 text-xs text-text-secondary dark:text-white/60">
                The Final is done — in production this is where the winners
                export (top-5 ×50 / ranks 6–10 ×40 / ranks 11–20 ×15 USDC
                among qualified) runs.
              </p>
            )}
          </PlayCard>

          <PlayCard>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-white/40">
              Referral / qualification sim
            </p>
            <p className="text-xs text-text-secondary dark:text-white/60">
              {st.activatedReferrals} of 5 activated
              {st.activatedReferrals >= 5 && st.giveawayOptIn ? " — QUALIFIED" : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={st.activatedReferrals >= 5}
                onClick={() => runSim(() => backend.activateReferral())}
                className={`${secondaryButtonClasses} inline-flex items-center gap-2 disabled:opacity-40`}
              >
                <UserAdd01Icon className="size-4" />
                +1 activated referral
              </button>
              <button
                type="button"
                onClick={() => runSim(() => backend.expireDeadline())}
                className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
              >
                <AlarmClockIcon className="size-4" />
                Expire deadline
              </button>
            </div>
          </PlayCard>

          {log.length > 0 && (
            <PlayCard>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-white/40">
                Sim log
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-text-secondary dark:text-white/60">
                {log.map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ul>
            </PlayCard>
          )}
        </div>

        {/* The real pages */}
        <div className="min-w-0">
          <nav className="scrollbar-hide mb-4 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-lavender-500 text-white"
                    : "text-text-secondary hover:bg-accent-gray dark:text-white/50 dark:hover:bg-white/5"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <QueryClientProvider client={queryClient}>
            <div key={`${scenario}-${version}-${tab}`}>
              {tab === "Landing" && <PlayLanding />}
              {tab === "My Team" && <TeamPage />}
              {tab === "Matchday" && <MatchdayPanel version={version} />}
              {tab === "Leaderboard" && <LeaderboardPage />}
              {tab === "Rewards" && <RewardsPage />}
            </div>
          </QueryClientProvider>
        </div>
      </div>
      </div>
    </div>
  );
};
