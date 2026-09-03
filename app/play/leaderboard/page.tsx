"use client";

/**
 * /play/leaderboard — global leaderboard: rank, movement, username and
 * points, with self-row highlight, "Find me" jump and pagination.
 */

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Search01Icon,
  UserGroupIcon,
} from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import {
  LeaderboardTable,
  SELF_ROW_ID,
} from "@/app/components/play/LeaderboardTable";
import { useJoinStatus, useLeaderboard } from "@/app/components/play/hooks";
import {
  EmptyState,
  ErrorState,
  Skeleton,
  secondaryButtonClasses,
} from "@/app/components/play/ui";

/** How long the "You" row keeps its ring after a Find me jump. */
const SELF_HIGHLIGHT_MS = 2400;

export default function LeaderboardPage() {
  const [page, setPage] = useState(1);
  const [findMe, setFindMe] = useState(false);
  const [pendingSelfScroll, setPendingSelfScroll] = useState(false);
  const [highlightSelf, setHighlightSelf] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const { authenticated } = usePrivy();
  const { joined } = useJoinStatus();

  const { data, isPending, isFetching, isPlaceholderData, isError, refetch } =
    useLeaderboard(page, findMe);

  useEffect(() => {
    trackEvent("leaderboard_viewed", { page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keepPreviousData hands back the outgoing page's rows the instant findMe
  // flips the query key, so `data` is non-null before the find request has run.
  // Acting on that placeholder would set the page back to where we already were
  // and clear findMe, silently cancelling the jump — wait for the real result.
  useEffect(() => {
    if (findMe && data && !isPlaceholderData) {
      setPage(data.page);
      setFindMe(false);
    }
  }, [findMe, data, isPlaceholderData]);

  // Landing on the right page is not enough — on a full page of 50 the "You"
  // row is usually below the fold. Once the rows holding it are committed,
  // bring it to the middle of the viewport and ring it.
  useEffect(() => {
    // Placeholder rows belong to the page we are leaving: scrolling to them, or
    // concluding from them that there is no self row, both break the jump.
    if (!pendingSelfScroll || !data || isPlaceholderData) return;
    const hasSelf = data.rows.some((row) => row.is_me);
    if (!hasSelf) {
      // Signed in but not ranked yet (no scores computed) — nothing to jump to.
      if (!findMe) setPendingSelfScroll(false);
      return;
    }
    setPendingSelfScroll(false);
    setHighlightSelf(true);
    const row = document.getElementById(SELF_ROW_ID);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    // preventScroll: scrollIntoView above already owns the movement, and
    // focus() would otherwise jump instantly and cancel the smooth scroll.
    row?.focus({ preventScroll: true });
  }, [pendingSelfScroll, data, findMe, isPlaceholderData]);

  useEffect(() => {
    if (!highlightSelf) return;
    const timer = window.setTimeout(
      () => setHighlightSelf(false),
      SELF_HIGHLIGHT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [highlightSelf]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const goToPage = (next: number) => {
    setPage(next);
    setHighlightSelf(false);
    // Keep the top of the list in view: without this the browser holds the old
    // scroll offset and the new page appears to open halfway down.
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
              setPendingSelfScroll(true);
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
          {/* Rows from the previous page stay mounted while the next one loads
              (see keepPreviousData in useLeaderboard) — dim them rather than
              collapsing the table into skeletons on every Prev/Next. */}
          <div
            ref={tableRef}
            aria-busy={isFetching}
            className={`transition-opacity duration-200 ${
              isFetching ? "opacity-60" : "opacity-100"
            }`}
          >
            <LeaderboardTable rows={data.rows} highlightSelf={highlightSelf} />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, page - 1))}
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
              onClick={() => goToPage(Math.min(totalPages, page + 1))}
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
