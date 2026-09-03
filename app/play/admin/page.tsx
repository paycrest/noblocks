"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * /play/admin — minimal F-15 admin console. Self-authenticating via the
 * x-admin-key header (stored in sessionStorage), so it works regardless of
 * the fantasy feature flag and Privy auth. Deliberately self-contained: no
 * /play layout dependencies.
 */

const KEY_STORAGE = "fantasy_admin_key";
const PAGE_SIZE = 50;

interface AdminParticipant {
  wallet_address: string;
  username: string | null;
  total_points: number;
  rank: number;
  previous_rank: number | null;
  badge: string;
  disqualified: boolean;
  giveaway_opt_in: boolean;
  joined_at: string;
  flags: unknown[];
}

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

const badgeClasses: Record<string, string> = {
  active:
    "bg-green-100 text-green-800 dark:bg-green-500/10 dark:text-green-400",
  opted_out:
    "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-white/50",
};

const inputClasses =
  "min-h-11 w-full rounded-xl border border-border-input bg-transparent px-3 py-2 text-sm text-text-body outline-none focus:border-lavender-500 dark:border-white/20 dark:text-white dark:placeholder:text-white/30";

const primaryButtonClasses =
  "min-h-11 rounded-xl bg-lavender-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-lavender-600 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClasses =
  "min-h-11 rounded-xl bg-accent-gray px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-accent-gray/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

const rowActionClasses =
  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors";

function ChallengeAdmin({
  adminFetch,
}: {
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [challenges, setChallenges] = useState<
    {
      id: string;
      gameweek_id: number;
      title: string;
      prize_usdc: number;
      status: string;
      winner_wallet: string | null;
    }[]
  >([]);
  const [gw, setGw] = useState("101");
  const [title, setTitle] = useState("");
  const [prize, setPrize] = useState("10");

  const load = useCallback(async () => {
    try {
      const response = await adminFetch("/api/play/admin/challenges");
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Failed");
      setChallenges(json.data.challenges ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load challenges");
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    try {
      const response = await adminFetch("/api/play/admin/challenges", {
        method: "POST",
        body: JSON.stringify({
          gameweekId: Number(gw),
          title,
          prizeUsdc: Number(prize),
        }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Failed");
      toast.success("Challenge created");
      setTitle("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    }
  };

  const resolve = async (challengeId: string) => {
    try {
      const response = await adminFetch("/api/play/admin/challenges?resolve=1", {
        method: "POST",
        body: JSON.stringify({ challengeId }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Failed");
      toast.success("Challenge resolved");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Resolve failed");
    }
  };

  const downloadCsv = async (challengeId: string) => {
    try {
      const response = await adminFetch(
        `/api/play/admin/challenges?id=${encodeURIComponent(challengeId)}&format=csv`,
      );
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `challenge-${challengeId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Challenge CSV downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV failed");
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border-light p-4 dark:border-white/10">
      <div>
        <h2 className="text-sm font-semibold text-text-body dark:text-white">
          Gameweek challenges
        </h2>
        <p className="text-sm text-text-secondary dark:text-white/50">
          Ops tooling for marketing campaigns — create challenges, resolve winners
          after scores are final (worker also resolves when the GW goes final),
          then export CSV for manual payout.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={gw}
          onChange={(e) => setGw(e.target.value)}
          placeholder="GW id (101)"
          className={`${inputClasses} max-w-[8rem]`}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className={`${inputClasses} min-w-[12rem] flex-1`}
        />
        <input
          value={prize}
          onChange={(e) => setPrize(e.target.value)}
          placeholder="Payout USDC"
          className={`${inputClasses} max-w-[6rem]`}
        />
        <button
          type="button"
          onClick={create}
          disabled={title.trim().length < 3}
          className={primaryButtonClasses}
        >
          Create
        </button>
      </div>
      <ul className="space-y-2 text-sm">
        {challenges.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background-neutral px-3 py-2 dark:bg-white/5"
          >
            <span className="text-text-body dark:text-white">
              {c.title} · GW {c.gameweek_id - 100} · {c.prize_usdc} USDC ·{" "}
              <span className="font-medium">{c.status}</span>
              {c.winner_wallet
                ? ` · ${c.winner_wallet.slice(0, 6)}…${c.winner_wallet.slice(-4)}`
                : ""}
            </span>
            <span className="flex gap-2">
              {c.status !== "resolved" && (
                <button
                  type="button"
                  onClick={() => resolve(c.id)}
                  className={secondaryButtonClasses}
                >
                  Resolve
                </button>
              )}
              {c.status === "resolved" && (
                <button
                  type="button"
                  onClick={() => downloadCsv(c.id)}
                  className={secondaryButtonClasses}
                >
                  CSV
                </button>
              )}
            </span>
          </li>
        ))}
        {challenges.length === 0 && (
          <li className="text-text-secondary dark:text-white/50">No challenges yet.</li>
        )}
      </ul>
    </section>
  );
}

export default function PlayAdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const [participants, setParticipants] = useState<AdminParticipant[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [winnersJson, setWinnersJson] = useState<string | null>(null);

  useEffect(() => {
    setAdminKey(sessionStorage.getItem(KEY_STORAGE));
    setHydrated(true);
  }, []);

  const clearKey = useCallback(() => {
    sessionStorage.removeItem(KEY_STORAGE);
    setAdminKey(null);
    setParticipants([]);
    setWinnersJson(null);
  }, []);

  const adminFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(path, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
          "x-admin-key": adminKey ?? "",
        },
      });
      if (response.status === 401) {
        clearKey();
        throw new Error("Invalid admin key");
      }
      return response;
    },
    [adminKey, clearKey],
  );

  const loadParticipants = useCallback(
    async (targetPage: number, targetSearch: string) => {
      if (!adminKey) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(targetPage) });
        if (targetSearch) params.set("search", targetSearch);
        const response = await adminFetch(
          `/api/play/admin/participants?${params.toString()}`,
        );
        const json = await response.json();
        if (!json.success) throw new Error(json.error || "Request failed");
        setParticipants(json.data.participants as AdminParticipant[]);
        setTotal(Number(json.data.total ?? 0));
        setPage(Number(json.data.page ?? targetPage));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load participants",
        );
      } finally {
        setLoading(false);
      }
    },
    [adminKey, adminFetch],
  );

  useEffect(() => {
    if (adminKey) loadParticipants(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, page, search]);

  const saveKey = () => {
    const key = keyInput.trim();
    if (!key) {
      toast.error("Enter the admin key");
      return;
    }
    sessionStorage.setItem(KEY_STORAGE, key);
    setKeyInput("");
    setPage(1);
    setAdminKey(key);
  };

  const submitSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const setDisqualified = async (
    participant: AdminParticipant,
    disqualified: boolean,
  ) => {
    const reason = window.prompt(
      disqualified
        ? `Disqualify ${participant.username ?? participant.wallet_address}? Reason (optional):`
        : `Reinstate ${participant.username ?? participant.wallet_address}? Reason (optional):`,
      "",
    );
    if (reason === null) return; // cancelled
    try {
      const response = await adminFetch("/api/play/admin/disqualify", {
        method: "POST",
        body: JSON.stringify({
          walletAddress: participant.wallet_address,
          disqualified,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      toast.success(
        disqualified ? "Participant disqualified" : "Participant reinstated",
      );
      loadParticipants(page, search);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update participant",
      );
    }
  };

  const renameUsername = async (participant: AdminParticipant) => {
    const next = window.prompt(
      `New username for ${participant.wallet_address}:`,
      participant.username ?? "",
    );
    if (next === null) return; // cancelled
    const username = next.trim();
    if (!username) {
      toast.error("Username cannot be empty");
      return;
    }
    try {
      const response = await adminFetch("/api/play/admin/username", {
        method: "POST",
        body: JSON.stringify({
          walletAddress: participant.wallet_address,
          username,
        }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      toast.success(`Username updated to ${json.data.username}`);
      loadParticipants(page, search);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update username",
      );
    }
  };

  const downloadWinnersCsv = async () => {
    try {
      const response = await adminFetch("/api/play/admin/winners?format=csv");
      if (!response.ok) throw new Error("Failed to export winners");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fantasy-winners.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Winners CSV downloaded");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download CSV",
      );
    }
  };

  const viewWinnersJson = async () => {
    try {
      const response = await adminFetch("/api/play/admin/winners");
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Request failed");
      setWinnersJson(JSON.stringify(json.data, null, 2));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load winners",
      );
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!hydrated) return null;

  if (!adminKey) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
        <h1 className="text-lg font-semibold text-text-body dark:text-white">
          Noblocks Play — Admin
        </h1>
        <p className="text-sm text-text-secondary dark:text-white/50">
          Enter the admin key to manage participants, moderation and campaign
          exports. The key is kept in this browser session only.
        </p>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveKey()}
          placeholder="Admin key"
          className={inputClasses}
          autoFocus
        />
        <button type="button" onClick={saveKey} className={primaryButtonClasses}>
          Unlock
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-body dark:text-white">
            Noblocks Play — Admin
          </h1>
          <p className="text-sm text-text-secondary dark:text-white/50">
            {total} participant{total === 1 ? "" : "s"}
          </p>
        </div>
        <button type="button" onClick={clearKey} className={secondaryButtonClasses}>
          Change key
        </button>
      </header>

      <ChallengeAdmin adminFetch={adminFetch} />

      <section className="space-y-3 rounded-2xl border border-border-light p-4 dark:border-white/10">
        <div>
          <h2 className="text-sm font-semibold text-text-body dark:text-white">
            Winners export
          </h2>
          <p className="text-sm text-text-secondary dark:text-white/50">
            Ranked managers for marketing campaign payouts. Prefer the Challenges
            CSV for GW pots; this export is for broader ops use (e.g. MotM).
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={downloadWinnersCsv}
            className={primaryButtonClasses}
          >
            Download winners CSV
          </button>
          <button
            type="button"
            onClick={viewWinnersJson}
            className={secondaryButtonClasses}
          >
            View winners JSON
          </button>
          {winnersJson !== null && (
            <button
              type="button"
              onClick={() => setWinnersJson(null)}
              className={secondaryButtonClasses}
            >
              Hide JSON
            </button>
          )}
        </div>
        {winnersJson !== null && (
          <pre className="max-h-96 overflow-auto rounded-xl bg-accent-gray p-3 text-xs text-text-body dark:bg-white/5 dark:text-white/80">
            {winnersJson}
          </pre>
        )}
      </section>

      {/* Participants */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch()}
            placeholder="Search username or wallet"
            className={`${inputClasses} max-w-xs`}
          />
          <button
            type="button"
            onClick={submitSearch}
            disabled={loading}
            className={secondaryButtonClasses}
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setPage(1);
                setSearch("");
              }}
              className={secondaryButtonClasses}
            >
              Clear
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border-light dark:border-white/10">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-light text-xs uppercase tracking-wide text-text-secondary dark:border-white/10 dark:text-white/50">
                <th className="px-3 py-2.5 font-medium">Rank</th>
                <th className="px-3 py-2.5 font-medium">Username</th>
                <th className="px-3 py-2.5 font-medium">Wallet</th>
                <th className="px-3 py-2.5 font-medium">Points</th>
                <th className="px-3 py-2.5 font-medium">Badge</th>
                <th className="px-3 py-2.5 font-medium">Flags</th>
                <th className="px-3 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr
                  key={p.wallet_address}
                  className="border-b border-border-light last:border-0 dark:border-white/10"
                >
                  <td className="px-3 py-2.5 text-text-body dark:text-white">
                    {p.rank}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-text-body dark:text-white">
                    {p.username ?? (
                      <span className="text-text-secondary dark:text-white/40">
                        —
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 font-mono text-xs text-text-secondary dark:text-white/60"
                    title={p.wallet_address}
                  >
                    {shortAddress(p.wallet_address)}
                  </td>
                  <td className="px-3 py-2.5 text-text-body dark:text-white">
                    {p.total_points}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClasses[p.badge] ?? badgeClasses.opted_out}`}
                    >
                      {p.disqualified ? "disqualified" : p.badge}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-text-secondary dark:text-white/60">
                    {p.flags.length > 0 ? (
                      <span
                        className="cursor-help underline decoration-dotted"
                        title={JSON.stringify(p.flags, null, 2)}
                      >
                        {p.flags.length}
                      </span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-2">
                      {p.disqualified ? (
                        <button
                          type="button"
                          onClick={() => setDisqualified(p, false)}
                          className={`${rowActionClasses} bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20`}
                        >
                          Reinstate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDisqualified(p, true)}
                          className={`${rowActionClasses} bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20`}
                        >
                          Disqualify
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => renameUsername(p)}
                        className={`${rowActionClasses} bg-accent-gray text-gray-900 hover:bg-accent-gray/80 dark:bg-white/5 dark:text-white dark:hover:bg-white/10`}
                      >
                        Rename
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {participants.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-text-secondary dark:text-white/50"
                  >
                    {loading ? "Loading…" : "No participants found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            className={secondaryButtonClasses}
          >
            Previous
          </button>
          <span className="text-sm text-text-secondary dark:text-white/50">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={loading || page >= totalPages}
            className={secondaryButtonClasses}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
