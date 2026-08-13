"use client";

/**
 * /play/rewards — mini-leagues hub: create / join / leave private leagues.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  LinkSquare01Icon,
  UserGroupIcon,
} from "hugeicons-react";
import { toast } from "sonner";
import { LeagueCard } from "@/app/components/play/LeagueCard";
import { playKeys, useRewards } from "@/app/components/play/hooks";
import {
  createMiniLeague,
  joinMiniLeague,
  leaveMiniLeague,
  PlayApiError,
} from "@/app/components/play/api";
import {
  EmptyState,
  ErrorState,
  PlayCard,
  Skeleton,
  primaryButtonClasses,
  secondaryButtonClasses,
} from "@/app/components/play/ui";

const inputClasses =
  "min-h-11 w-full rounded-xl border border-border-input bg-white px-3 text-sm text-text-body transition-colors placeholder:text-text-disabled focus:border-lavender-500 focus:outline-none focus:ring-2 focus:ring-lavender-500/20 dark:border-white/15 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-white/30";

const RewardsSkeleton = () => (
  <div className="space-y-5">
    <Skeleton className="h-10 w-48" />
    <Skeleton className="h-40 w-full rounded-2xl" />
    <div className="grid gap-4 sm:grid-cols-2">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
    </div>
  </div>
);

export default function RewardsPage() {
  const searchParams = useSearchParams();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const { data, isLoading, error, refetch } = useRewards(authenticated);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinHighlight, setJoinHighlight] = useState(false);
  const joinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const join = searchParams.get("join")?.trim().toUpperCase();
    if (!join || join.length < 4) return;
    setCode(join);
    setJoinHighlight(true);
    window.setTimeout(() => {
      joinInputRef.current?.focus();
      document.getElementById("join-league")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);
  }, [searchParams]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: playKeys.rewards });
    await refetch();
  };

  const withToken = async (fn: (token: string) => Promise<unknown>) => {
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new PlayApiError("Unauthorized", 401);
      await fn(token);
      await refresh();
    } catch (e) {
      const msg = e instanceof PlayApiError ? e.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!ready || (authenticated && isLoading)) return <RewardsSkeleton />;

  if (!authenticated) {
    const inviteCode = searchParams.get("join")?.trim().toUpperCase();
    return (
      <EmptyState
        icon={<UserGroupIcon className="size-8 text-lavender-500" />}
        title="Sign in to continue"
        description={
          inviteCode
            ? `Connect your wallet to join the mini-league (${inviteCode}). You'll need a Noblocks Play account first.`
            : "Connect your wallet to create or join mini-leagues with friends."
        }
        action={
          <button
            type="button"
            onClick={() => login()}
            className={primaryButtonClasses}
          >
            Sign in
          </button>
        }
      />
    );
  }

  if (error instanceof PlayApiError && error.code === "NOT_JOINED") {
    return (
      <EmptyState
        icon={<UserGroupIcon className="size-8 text-lavender-500" />}
        title="Join Noblocks Play first"
        description="Pick a username and enter the league, then come back here to join your friend's mini-league."
        action={
          <Link href="/play" className={primaryButtonClasses}>
            Join the league
          </Link>
        }
      />
    );
  }

  if (error) {
    return <ErrorState message="Could not load this page." onRetry={() => refetch()} />;
  }

  const leagues = data?.leagues ?? [];

  return (
    <div className="space-y-5 max-lg:pb-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-body dark:text-white">
          Leagues
        </h1>
        <p className="mt-1 text-sm text-text-secondary dark:text-white/60">
          Rank #{data?.rank ?? "—"} · {data?.total_points ?? 0} pts overall
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PlayCard className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-lavender-100 dark:bg-lavender-500/15">
              <Add01Icon className="size-4 text-lavender-600 dark:text-lavender-400" />
            </span>
            <h2 className="text-sm font-semibold text-text-body dark:text-white">
              Create a league
            </h2>
          </div>
          <p className="text-xs text-text-secondary dark:text-white/50">
            Name it, get an invite code, share with mates.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="League name"
              maxLength={40}
              className={inputClasses}
            />
            <button
              type="button"
              disabled={busy || name.trim().length < 3}
              onClick={() =>
                withToken(async (token) => {
                  const { league } = await createMiniLeague(name.trim(), token);
                  setName("");
                  toast.success(`"${league.name}" created — share the invite below`);
                })
              }
              className={`${primaryButtonClasses} shrink-0 sm:min-w-[6.5rem]`}
            >
              Create
            </button>
          </div>
        </PlayCard>

        <div
          id="join-league"
          className={
            joinHighlight
              ? "rounded-2xl ring-2 ring-lavender-500/40 dark:ring-lavender-400/30"
              : undefined
          }
        >
          <PlayCard className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent-gray dark:bg-white/10">
              <LinkSquare01Icon className="size-4 text-text-body dark:text-white/80" />
            </span>
            <h2 className="text-sm font-semibold text-text-body dark:text-white">
              Join with code
            </h2>
          </div>
          <p className="text-xs text-text-secondary dark:text-white/50">
            Paste a code from a friend or open their invite link.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={joinInputRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setJoinHighlight(false);
              }}
              placeholder="e.g. 27GK6B89"
              maxLength={12}
              spellCheck={false}
              autoComplete="off"
              className={`${inputClasses} font-mono uppercase tracking-wider`}
            />
            <button
              type="button"
              disabled={busy || code.trim().length < 4}
              onClick={() =>
                withToken(async (token) => {
                  await joinMiniLeague(code.trim(), token);
                  setCode("");
                  setJoinHighlight(false);
                  toast.success("Joined league");
                })
              }
              className={`${primaryButtonClasses} shrink-0 sm:min-w-[6.5rem]`}
            >
              Join
            </button>
          </div>
          </PlayCard>
        </div>
      </div>

      {leagues.length === 0 ? (
        <EmptyState
          icon={<UserGroupIcon className="size-8 text-lavender-500/80" />}
          title="No leagues yet"
          description="Create one and tap Share on the invite strip, or join a friend's league with their code."
          action={
            <Link href="/play/team" className={`${secondaryButtonClasses} inline-flex`}>
              Build your squad
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {leagues.map((league) => (
            <LeagueCard
              key={league.id}
              league={league}
              onLeave={(id) =>
                withToken(async (token) => {
                  await leaveMiniLeague(id, token);
                  toast.success("Left league");
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
