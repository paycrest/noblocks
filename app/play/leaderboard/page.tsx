"use client";

/**
 * /play/leaderboard — global leaderboard: rank, movement, username and
 * points, with self-row highlight, "Find me" jump and pagination.
 */

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Search01Icon,
  UserGroupIcon,
} from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import { LeaderboardTable } from "@/app/components/play/LeaderboardTable";
import { useJoinStatus, useLeaderboard } from "@/app/components/play/hooks";
import {
  EmptyState,
  ErrorState,
  Skeleton,
  secondaryButtonClasses,
} from "@/app/components/play/ui";

export default function LeaderboardPage() {
  const [page, setPage] = useState(1);
  const [findMe, setFindMe] = useState(false);
  const { authenticated } = usePrivy();
  const { joined } = useJoinStatus();

  const { data, isPending, isError, refetch } = useLeaderboard(page, findMe);

  useEffect(() => {
    trackEvent("leaderboard_viewed", { page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (findMe && data) {
      setPage(data.page);
      setFindMe(false);
    }
  }, [findMe, data]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4 max-lg:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-body dark:text-white">
          Leaderboard
        </h1>
        {authenticated && joined && (
          <button
            type="button"
            onClick={() => {
              setFindMe(true);
            }}
            className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
          >
            <Search01Icon className="size-4" />
            Find me
          </button>
        )}
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          message="Couldn't load the leaderboard."
          onRetry={() => refetch()}
        />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={<UserGroupIcon className="size-8 text-lavender-500" />}
          title="No managers on the board yet"
          description="Scores appear once the first matchday has been played. Join now to claim your spot."
        />
      ) : (
        <>
          <LeaderboardTable rows={data.rows} />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={`${secondaryButtonClasses} inline-flex items-center gap-1`}
            >
              <ArrowLeft01Icon className="size-4" />
              Prev
            </button>
            <span className="text-xs text-text-secondary dark:text-white/50">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={`${secondaryButtonClasses} inline-flex items-center gap-1`}
            >
              Next
              <ArrowRight01Icon className="size-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
