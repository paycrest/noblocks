"use client";

/**
 * Squad builder / manager for /play/team.
 *
 * Modes (mirroring the server rules in /api/play/squad and /transfers):
 * - build:    initial squad before lock — free composition editing + autofill
 * - manage:   rolled-over squad before lock — lineup/captaincy via PUT,
 *             composition changes via transfer mode (−3 per extra transfer)
 * - live:     round locked — same 15; XI/bench swaps and captaincy under the
 *             rolling lockout (server re-validates everything)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AirplaneTakeOff01Icon,
  ArrowDataTransferHorizontalIcon,
  Cancel01Icon,
  MagicWand01Icon,
  RefreshIcon,
  SquareLock02Icon,
  Tick02Icon,
} from "hugeicons-react";
import { useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "@/app/hooks/analytics/client";
import { PlayApiError } from "./api";
import {
  playKeys,
  useCountdown,
  useMakeTransfers,
  useSaveSquad,
} from "./hooks";
import type {
  BuilderSettings,
  FantasyPlayer,
  LockState,
  PlayersResponse,
  Position,
  SquadResponse,
} from "./types";
import { PitchView, PlayerPhoto, type SlotView } from "./PitchView";
import { BenchRow } from "./BenchRow";
import { BudgetBar } from "./BudgetBar";
import { PlayerPicker } from "./PlayerPicker";
import { Chip, primaryButtonClasses, secondaryButtonClasses } from "./ui";

const POS_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

interface EditorState {
  byPos: Record<Position, number[]>;
  benched: number[];
  captainId: number | null;
  viceId: number | null;
}

const emptyEditor = (): EditorState => ({
  byPos: { GK: [], DEF: [], MID: [], FWD: [] },
  benched: [],
  captainId: null,
  viceId: null,
});

const editorSignature = (state: EditorState) =>
  JSON.stringify([
    POS_ORDER.map((pos) => [...state.byPos[pos]].sort((a, b) => a - b)),
    [...state.benched].sort((a, b) => a - b),
    state.captainId,
    state.viceId,
  ]);

/** All ids in the editor, XI first per position order. */
const allIds = (state: EditorState) =>
  POS_ORDER.flatMap((pos) => state.byPos[pos]);

const xiIds = (state: EditorState) => {
  const benched = new Set(state.benched);
  return allIds(state).filter((id) => !benched.has(id));
};

const formationOf = (
  state: EditorState,
  playersById: Map<number, FantasyPlayer>,
) => {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of xiIds(state)) {
    const pos = playersById.get(id)?.position;
    if (pos) counts[pos]++;
  }
  return counts;
};

const isFormationValid = (
  counts: Record<Position, number>,
  settings: BuilderSettings,
) =>
  counts.GK === 1 &&
  settings.formations.includes(`${counts.DEF}-${counts.MID}-${counts.FWD}`);

/**
 * Default XI shape while building (an XI is always 11 — the other 4 picks go
 * straight to the bench). First formation in settings is the default (4-4-2);
 * swaps can reshape it afterwards within the allowed formations.
 */
const defaultXiQuota = (settings: BuilderSettings): Record<Position, number> => {
  const [def, mid, fwd] = (settings.formations?.[0] ?? "4-4-2")
    .split("-")
    .map(Number);
  return { GK: 1, DEF: def || 4, MID: mid || 4, FWD: fwd || 2 };
};

export const TeamManager = ({
  squadData,
  poolData,
}: {
  squadData: SquadResponse;
  poolData: PlayersResponse;
}) => {
  const queryClient = useQueryClient();
  const saveMutation = useSaveSquad();
  const transferMutation = useMakeTransfers();

  const { matchday, locked, squad, free_transfers } = squadData;
  const settings = poolData.settings;
  const playersById = useMemo(
    () =>
      new Map(poolData.players.map((p) => [Number(p.provider_player_id), p])),
    [poolData.players],
  );

  const lockStateOf = useCallback(
    (id: number): LockState =>
      squad?.players.find((p) => p.player_id === id)?.lock_state ?? "unlocked",
    [squad],
  );
  // The armband holder whose points currently count double: the captain once
  // they've played, otherwise the vice (mirrors computeSquadPoints server-side).
  const doubledId = useMemo(() => {
    const captain = squad?.players.find((p) => p.is_captain);
    const vice = squad?.players.find((p) => p.is_vice);
    if (captain && captain.live.minutes > 0) return captain.player_id;
    if (vice && vice.live.minutes > 0) return vice.player_id;
    return null;
  }, [squad]);
  const livePointsOf = useCallback(
    (id: number) => {
      const points =
        squad?.players.find((p) => p.player_id === id)?.live.points ?? 0;
      return id === doubledId ? points * 2 : points;
    },
    [squad, doubledId],
  );
  // Server-side auto-sub outcome. Only meaningful once the round is locked;
  // while editing, the pitch shows the squad as picked and nothing is badged.
  const subStateOf = useCallback(
    (id: number) =>
      locked
        ? (squad?.players.find((p) => p.player_id === id)?.sub_state ?? null)
        : null,
    [squad, locked],
  );
  const subsOn = useMemo(
    () => (squad?.players ?? []).filter((p) => p.sub_state === "in").length,
    [squad],
  );
  // Auto-subs only settle when the round does: a starter whose fixture has
  // not kicked off yet reads as a blank mid-round, so say "so far" until final.
  const benchNote = !locked
    ? undefined
    : subsOn > 0
      ? `${subsOn} auto-sub${subsOn === 1 ? "" : "s"} counted${matchday.status === "final" ? "" : " so far"}`
      : matchday.status === "final"
        ? "no auto-subs this round"
        : undefined;

  /* --------------------------- editor state --------------------------- */

  const serverEditor = useMemo((): EditorState => {
    if (!squad) return emptyEditor();
    const state = emptyEditor();
    const sorted = [...squad.players].sort((a, b) => a.slot - b.slot);
    for (const entry of sorted) {
      const pos =
        entry.player?.position ?? playersById.get(entry.player_id)?.position;
      if (!pos) continue;
      state.byPos[pos].push(entry.player_id);
      if (entry.slot > 11) state.benched.push(entry.player_id);
      if (entry.is_captain) state.captainId = entry.player_id;
      if (entry.is_vice) state.viceId = entry.player_id;
    }
    return state;
  }, [squad, playersById]);

  const [editor, setEditor] = useState<EditorState>(serverEditor);
  const serverSignature = editorSignature(serverEditor);
  // Re-seed the editor whenever fresh server data arrives (post-save refetch).
  useEffect(() => {
    setEditor(serverEditor);
    setPendingTransfers([]);
    setTransferMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSignature]);

  const [transferMode, setTransferMode] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState<
    { out: number; in: number }[]
  >([]);
  const [sheetPlayerId, setSheetPlayerId] = useState<number | null>(null);
  const [picker, setPicker] = useState<
    | { mode: "add"; position: Position; toBench?: boolean }
    | { mode: "transferIn"; out: number; position: Position }
    | null
  >(null);

  const xiQuota = useMemo(() => defaultXiQuota(settings), [settings]);

  // When the lock deadline passes while the page is open, refetch — the
  // server flips into live-round mode.
  const countdown = useCountdown(locked ? null : matchday.lock_at);
  useEffect(() => {
    if (countdown.expired) {
      queryClient.invalidateQueries({ queryKey: playKeys.squad });
    }
  }, [countdown.expired, queryClient]);

  const buildMode = !locked && (!squad || squad.is_initial);
  const canTransfer = !locked && Boolean(squad) && !squad!.is_initial;

  /* --------------------- transfer-mode draft squad --------------------- */

  const draft = useMemo((): EditorState => {
    if (pendingTransfers.length === 0) return editor;
    const state: EditorState = {
      byPos: {
        GK: [...editor.byPos.GK],
        DEF: [...editor.byPos.DEF],
        MID: [...editor.byPos.MID],
        FWD: [...editor.byPos.FWD],
      },
      benched: [...editor.benched],
      captainId: editor.captainId,
      viceId: editor.viceId,
    };
    for (const { out, in: incoming } of pendingTransfers) {
      const pos = playersById.get(out)?.position;
      if (!pos) continue;
      const index = state.byPos[pos].indexOf(out);
      if (index >= 0) state.byPos[pos][index] = incoming;
      const benchIndex = state.benched.indexOf(out);
      if (benchIndex >= 0) state.benched[benchIndex] = incoming;
      if (state.captainId === out) state.captainId = incoming;
      if (state.viceId === out) state.viceId = incoming;
    }
    return state;
  }, [editor, pendingTransfers, playersById]);

  const view = transferMode ? draft : editor;
  const viewIds = useMemo(() => new Set(allIds(view)), [view]);
  const spent = useMemo(
    () =>
      allIds(view).reduce(
        (sum, id) => sum + Number(playersById.get(id)?.price ?? 0),
        0,
      ),
    [view, playersById],
  );

  const squadComplete = allIds(view).length === settings.squad_size;
  const dirty = editorSignature(editor) !== serverSignature;

  /* ------------------------------ actions ------------------------------ */

  const clubCount = (state: EditorState, teamId: number) =>
    allIds(state).filter((id) => playersById.get(id)?.team_id === teamId).length;

  const addDisabledReason = (player: FantasyPlayer): string | null => {
    if (!picker) return null;
    const base = picker.mode === "transferIn" ? draft : editor;
    const exclude = picker.mode === "transferIn" ? picker.out : null;
    if (player.position !== picker.position) return "Wrong position";
    const cap = settings.club_cap;
    if (cap != null) {
      let count = clubCount(base, player.team_id);
      if (exclude != null && playersById.get(exclude)?.team_id === player.team_id)
        count -= 1;
      if (count >= cap) return `Club cap reached (${cap})`;
    }
    let budgetUsed = allIds(base).reduce(
      (sum, id) => sum + Number(playersById.get(id)?.price ?? 0),
      0,
    );
    if (exclude != null)
      budgetUsed -= Number(playersById.get(exclude)?.price ?? 0);
    if (budgetUsed + Number(player.price) > settings.budget + 1e-9)
      return "Over budget";
    return null;
  };

  /** Default bench + captaincy once 15 players are picked (build mode). */
  const normalize = (state: EditorState): EditorState => {
    const next = { ...state, benched: [...state.benched] };
    if (allIds(next).length !== settings.squad_size) return next;

    const counts = formationOf(next, playersById);
    const benchValid =
      next.benched.length === 4 && isFormationValid(counts, settings);
    if (!benchValid) {
      // Default formation: bench whichever players don't fit the default XI
      // quota per position — the tail of each position's picks — derived
      // from settings.positions/xiQuota so this adapts to a rules change.
      next.benched = (Object.keys(next.byPos) as Position[]).flatMap((pos) => {
        const benchCount = settings.positions[pos] - xiQuota[pos];
        return benchCount > 0 ? next.byPos[pos].slice(-benchCount) : [];
      });
    }
    const xi = xiIds(next);
    const byPrice = [...xi].sort(
      (a, b) =>
        Number(playersById.get(b)?.price ?? 0) -
        Number(playersById.get(a)?.price ?? 0),
    );
    if (next.captainId == null || !xi.includes(next.captainId)) {
      next.captainId = byPrice[0] ?? null;
    }
    if (
      next.viceId == null ||
      !xi.includes(next.viceId) ||
      next.viceId === next.captainId
    ) {
      next.viceId = byPrice.find((id) => id !== next.captainId) ?? null;
    }
    return next;
  };

  const handlePick = (player: FantasyPlayer) => {
    if (!picker) return;
    const id = Number(player.provider_player_id);
    if (picker.mode === "add") {
      const targetBench = picker.toBench === true;
      setEditor((prev) => {
        const pos = player.position;
        if (prev.byPos[pos].length >= settings.positions[pos]) {
          return prev;
        }
        // XI fills first (up to the default formation's quota); the pick
        // lands on the bench when aimed there or when the XI row is full.
        const benchedSet = new Set(prev.benched);
        const xiCount = prev.byPos[pos].filter((x) => !benchedSet.has(x)).length;
        const benchCount = prev.byPos[pos].length - xiCount;
        const benchQuota = settings.positions[pos] - xiQuota[pos];
        const goesToBench =
          (targetBench && benchCount < benchQuota) || xiCount >= xiQuota[pos];
        const next: EditorState = {
          ...prev,
          byPos: {
            ...prev.byPos,
            [pos]: [...prev.byPos[pos], id],
          },
          benched: goesToBench ? [...prev.benched, id] : prev.benched,
        };
        return normalize(next);
      });
    } else {
      setPendingTransfers((prev) => [...prev, { out: picker.out, in: id }]);
    }
    setPicker(null);
  };

  const handleRemove = (playerId: number) => {
    setEditor((prev) => {
      const pos = playersById.get(playerId)?.position;
      if (!pos) return prev;
      return {
        byPos: {
          ...prev.byPos,
          [pos]: prev.byPos[pos].filter((id) => id !== playerId),
        },
        benched: prev.benched.filter((id) => id !== playerId),
        captainId: prev.captainId === playerId ? null : prev.captainId,
        viceId: prev.viceId === playerId ? null : prev.viceId,
      };
    });
    setSheetPlayerId(null);
  };

  /** Bench⇄XI swap partners that keep the formation valid (+ lock rules). */
  const eligibleSwaps = useCallback(
    (playerId: number): number[] => {
      const state = view;
      const player = playersById.get(playerId);
      if (!player) return [];
      // Eliminated players are frozen where they are: no XI⇄bench swaps in
      // either direction — remove (build) or transfer them out instead.
      if (!player.is_active) return [];
      const benchedSet = new Set(state.benched);
      const isBenched = benchedSet.has(playerId);
      const candidates = isBenched
        ? xiIds(state)
        : state.benched.filter((id) => viewIds.has(id));

      return candidates.filter((otherId) => {
        const other = playersById.get(otherId);
        if (!other) return false;
        if (!other.is_active) return false;
        // GK only swaps GK; outfield swaps must land on a valid formation.
        const counts = formationOf(state, playersById);
        const incoming = isBenched ? player : other; // entering the XI
        const outgoing = isBenched ? other : player; // leaving the XI
        counts[outgoing.position]--;
        counts[incoming.position]++;
        if (!isFormationValid(counts, settings)) return false;
        if (locked) {
          // Rolling lockout: incoming must be pre-kickoff; outgoing not
          // mid-match. Benching a FINISHED player is allowed — the points
          // they earned in the XI are banked at kickoff server-side.
          const incomingId = isBenched ? playerId : otherId;
          const outgoingId = isBenched ? otherId : playerId;
          if (lockStateOf(incomingId) !== "unlocked") return false;
          if (lockStateOf(outgoingId) === "locked") return false;
        }
        return true;
      });
    },
    [view, viewIds, playersById, settings, locked, lockStateOf],
  );

  const handleSwap = (a: number, b: number) => {
    setEditor((prev) => {
      const benched = new Set(prev.benched);
      const benchedOne = benched.has(a) ? a : b;
      const xiOne = benchedOne === a ? b : a;
      if (!benched.has(benchedOne) || benched.has(xiOne)) return prev;
      const nextBenched = prev.benched.map((id) =>
        id === benchedOne ? xiOne : id,
      );
      // Captaincy follows the player coming into the XI if the outgoing
      // XI player held it (captain/vice must stay in the XI).
      const captainId =
        prev.captainId === xiOne ? benchedOne : prev.captainId;
      const viceId = prev.viceId === xiOne ? benchedOne : prev.viceId;
      return { ...prev, benched: nextBenched, captainId, viceId };
    });
    setSheetPlayerId(null);
  };

  const handleCaptain = (playerId: number, role: "captain" | "vice") => {
    if (playersById.get(playerId)?.is_active === false) {
      toast.error("Eliminated players can't wear the armband");
      return;
    }
    if (locked) {
      const state = lockStateOf(playerId);
      const played =
        (squad?.players.find((p) => p.player_id === playerId)?.live.minutes ??
          0) > 0;
      if (state !== "unlocked" || played) {
        toast.error("The new (vice-)captain must not have played yet");
        return;
      }
    }
    setEditor((prev) => {
      if (role === "captain") {
        return {
          ...prev,
          captainId: playerId,
          viceId: prev.viceId === playerId ? prev.captainId : prev.viceId,
        };
      }
      return {
        ...prev,
        viceId: playerId,
        captainId: prev.captainId === playerId ? prev.viceId : prev.captainId,
      };
    });
    setSheetPlayerId(null);
  };

  const autofill = () => {
    const pool = poolData.players.filter((p) => p.is_active);
    const cap = settings.club_cap ?? Infinity;

    const attempt = (randomized: boolean): EditorState | null => {
      const state: EditorState = {
        byPos: {
          GK: [...editor.byPos.GK],
          DEF: [...editor.byPos.DEF],
          MID: [...editor.byPos.MID],
          FWD: [...editor.byPos.FWD],
        },
        benched: [],
        captainId: editor.captainId,
        viceId: editor.viceId,
      };
      const chosen = new Set(allIds(state));
      const clubs = new Map<number, number>();
      let cost = 0;
      for (const id of chosen) {
        const p = playersById.get(id);
        if (!p) continue;
        cost += Number(p.price);
        clubs.set(p.team_id, (clubs.get(p.team_id) ?? 0) + 1);
      }
      for (const pos of POS_ORDER) {
        const need = settings.positions[pos] - state.byPos[pos].length;
        if (need <= 0) continue;
        let candidates = pool.filter(
          (p) => p.position === pos && !chosen.has(Number(p.provider_player_id)),
        );
        candidates = randomized
          ? [...candidates].sort(() => Math.random() - 0.5)
          : [...candidates].sort((a, b) => Number(a.price) - Number(b.price));
        let added = 0;
        for (const candidate of candidates) {
          if (added >= need) break;
          if ((clubs.get(candidate.team_id) ?? 0) >= cap) continue;
          const id = Number(candidate.provider_player_id);
          chosen.add(id);
          state.byPos[pos].push(id);
          clubs.set(candidate.team_id, (clubs.get(candidate.team_id) ?? 0) + 1);
          cost += Number(candidate.price);
          added++;
        }
        if (added < need) return null;
      }
      if (cost > settings.budget + 1e-9) return null;
      return state;
    };

    let result: EditorState | null = null;
    for (let i = 0; i < 200 && !result; i++) result = attempt(true);
    if (!result) result = attempt(false); // cheapest-first fallback
    if (!result) {
      toast.error("Couldn't build a valid squad within the budget");
      return;
    }
    setEditor(normalize(result));
  };

  /* ------------------------------- save ------------------------------- */

  const buildSelection = (state: EditorState) => {
    const benched = new Set(state.benched);
    const xi = POS_ORDER.flatMap((pos) =>
      state.byPos[pos].filter((id) => !benched.has(id)),
    );
    const bench = POS_ORDER.flatMap((pos) =>
      state.byPos[pos].filter((id) => benched.has(id)),
    );
    return {
      players: [
        ...xi.map((playerId, i) => ({ playerId, slot: i + 1 })),
        ...bench.map((playerId, i) => ({ playerId, slot: i + 12 })),
      ],
      captainId: state.captainId ?? 0,
      viceId: state.viceId ?? 0,
    };
  };

  const handleSave = async () => {
    if (!squadComplete) {
      toast.error(
        `Pick ${settings.squad_size - allIds(editor).length} more player(s) first`,
      );
      return;
    }
    if (editor.captainId == null || editor.viceId == null) {
      toast.error("Set a captain and a vice-captain");
      return;
    }
    if (spent > settings.budget + 1e-9) {
      toast.error("You're over budget");
      return;
    }
    try {
      await saveMutation.mutateAsync(buildSelection(editor));
      trackEvent("squad_saved", { matchday_id: matchday.id });
      toast.success("Squad saved");
    } catch (error) {
      if (error instanceof PlayApiError) {
        (error.errors?.length ? error.errors : [error.message])
          .slice(0, 4)
          .forEach((message) => toast.error(message));
      } else {
        toast.error("Failed to save squad");
      }
    }
  };

  const transferCost =
    Math.max(
      0,
      pendingTransfers.length - (squad?.free_transfers_remaining ?? 0),
    ) * settings.transfer_penalty;

  const handleConfirmTransfers = async () => {
    if (pendingTransfers.length === 0) return;
    try {
      const result = await transferMutation.mutateAsync({
        transfers: pendingTransfers,
      });
      toast.success(
        `${result.applied} transfer(s) applied${
          result.points_cost > 0 ? ` (−${result.points_cost} pts)` : ""
        }`,
      );
      setPendingTransfers([]);
      setTransferMode(false);
    } catch (error) {
      if (error instanceof PlayApiError) {
        (error.errors?.length ? error.errors : [error.message])
          .slice(0, 4)
          .forEach((message) => toast.error(message));
      } else {
        toast.error("Failed to apply transfers");
      }
    }
  };

  /* ------------------------------ render ------------------------------ */

  // Locked round with no squad: nothing to manage — the next round opens
  // after rollover (joining stays open until the Final's lock).
  if (locked && !squad) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-border-light px-6 py-10 text-center dark:border-white/10">
        <p className="text-sm font-semibold text-text-body dark:text-white">
          {matchday.display_name} is already locked
        </p>
        <p className="mx-auto max-w-sm text-sm text-text-secondary dark:text-white/50">
          You didn&apos;t save a squad before this round locked. Squad
          building reopens for the next round minutes after the last final
          whistle.
        </p>
      </div>
    );
  }

  const pendingIn = new Set(pendingTransfers.map((t) => t.in));

  // While the action sheet is open, light up its legal swap partners on the
  // pitch/bench behind it (and fade everyone else) so swaps are discoverable.
  const swapTargets =
    sheetPlayerId != null ? new Set(eligibleSwaps(sheetPlayerId)) : null;

  const slotViewFor = (id: number): SlotView => {
    const player = playersById.get(id) ?? null;
    return {
      key: String(id),
      player,
      position: player?.position ?? "MID",
      isCaptain: view.captainId === id,
      isVice: view.viceId === id,
      lockState: locked ? lockStateOf(id) : undefined,
      livePoints: livePointsOf(id),
      subState: subStateOf(id),
      markedIn: pendingIn.has(id),
      eliminated: player ? !player.is_active : false,
      highlighted: swapTargets?.has(id) ?? false,
      dimmed: swapTargets != null && !swapTargets.has(id) && id !== sheetPlayerId,
    };
  };

  const benchedSet = new Set(view.benched);
  const rows: Record<Position, SlotView[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  const benchSlots: SlotView[] = [];
  for (const pos of POS_ORDER) {
    const idsForPos = view.byPos[pos];
    rows[pos] = idsForPos.filter((id) => !benchedSet.has(id)).map(slotViewFor);
    const benchIds = idsForPos.filter(
      (id) => benchedSet.has(id) && viewIds.has(id),
    );
    benchSlots.push(...benchIds.map(slotViewFor));

    // While building, remaining capacity shows as add buttons — the pitch is
    // always a real XI (default formation) and the extra picks live on the
    // bench, never more than 11 on the grass.
    if (buildMode) {
      const remainingPicks = settings.positions[pos] - idsForPos.length;
      const xiEmpties = Math.min(
        Math.max(0, xiQuota[pos] - rows[pos].length),
        remainingPicks,
      );
      for (let i = 0; i < xiEmpties; i++) {
        rows[pos].push({
          key: `empty-${pos}-${i}`,
          player: null,
          position: pos,
        });
      }
      const benchQuota = settings.positions[pos] - xiQuota[pos];
      const benchEmpties = Math.min(
        Math.max(0, benchQuota - benchIds.length),
        remainingPicks - xiEmpties,
      );
      for (let i = 0; i < benchEmpties; i++) {
        benchSlots.push({
          key: `empty-bench-${pos}-${i}`,
          player: null,
          position: pos,
          benchSlot: true,
        });
      }
    }
  }

  const handleSlotClick = (slot: SlotView) => {
    if (!slot.player) {
      const pos = slot.position;
      if (view.byPos[pos].length < settings.positions[pos]) {
        setPicker({ mode: "add", position: pos, toBench: slot.benchSlot });
      }
      return;
    }
    const id = Number(slot.player.provider_player_id);
    if (transferMode) {
      if (pendingIn.has(id)) {
        // Un-queue the transfer that brought this player in.
        setPendingTransfers((prev) => prev.filter((t) => t.in !== id));
        return;
      }
      setPicker({ mode: "transferIn", out: id, position: slot.player.position });
      return;
    }
    setSheetPlayerId(id);
  };

  const sheetPlayer =
    sheetPlayerId != null ? (playersById.get(sheetPlayerId) ?? null) : null;

  const showPrice = !locked;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Round name, countdown and points all live in the shell header and
            round strip — this bar only carries squad-state chips. */}
        {locked && <Chip tone="red">Round live — rolling lockout</Chip>}
        {squad && !squad.is_initial && (
          <Chip>
            {squad.free_transfers_remaining} free transfer
            {squad.free_transfers_remaining === 1 ? "" : "s"} left
          </Chip>
        )}
        {!squad && <Chip>{free_transfers} free transfers this round</Chip>}
        {squad && squad.transfer_points_deduction > 0 && (
          <Chip tone="red">−{squad.transfer_points_deduction} pts transfers</Chip>
        )}
      </div>

      {(buildMode || transferMode) && (
        <BudgetBar spent={spent} budget={settings.budget} />
      )}

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2">
        {buildMode && (
          <button
            type="button"
            onClick={autofill}
            className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
          >
            <MagicWand01Icon className="size-4" />
            Autofill
          </button>
        )}
        {canTransfer && (
          <button
            type="button"
            onClick={() => {
              setTransferMode((v) => {
                if (v) setPendingTransfers([]);
                return !v;
              });
              setSheetPlayerId(null);
            }}
            className={`inline-flex items-center gap-2 ${
              transferMode ? primaryButtonClasses : secondaryButtonClasses
            }`}
          >
            <ArrowDataTransferHorizontalIcon className="size-4" />
            {transferMode ? "Exit transfer mode" : "Make transfers"}
          </button>
        )}
        {dirty && !transferMode && (
          <button
            type="button"
            onClick={() => setEditor(serverEditor)}
            className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
          >
            <RefreshIcon className="size-4" />
            Reset
          </button>
        )}
      </div>

      {transferMode && (
        <div className="space-y-2 rounded-2xl border border-lavender-300 bg-lavender-50 p-4 dark:border-lavender-500/30 dark:bg-lavender-500/10">
          <p className="text-sm font-medium text-text-body dark:text-white">
            Transfer mode — tap a player to swap them out
          </p>
          <p className="text-xs text-text-secondary dark:text-white/60">
            {pendingTransfers.length} pending ·{" "}
            {squad?.free_transfers_remaining ?? 0} free left · cost{" "}
            <span
              className={
                transferCost > 0 ? "font-semibold text-accent-red" : "font-semibold"
              }
            >
              −{transferCost} pts
            </span>{" "}
            (−{settings.transfer_penalty} per transfer beyond your free ones)
          </p>
          {pendingTransfers.length > 0 && (
            <ul className="space-y-1 text-xs text-text-body dark:text-white">
              {pendingTransfers.map((t) => (
                <li
                  key={`${t.out}-${t.in}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    <span className="text-accent-red">
                      {playersById.get(t.out)?.name ?? t.out}
                    </span>{" "}
                    → <span className="text-emerald-600 dark:text-emerald-400">{playersById.get(t.in)?.name ?? t.in}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Remove transfer"
                    onClick={() =>
                      setPendingTransfers((prev) =>
                        prev.filter((x) => x !== t),
                      )
                    }
                    className="text-text-secondary hover:text-accent-red dark:text-white/50"
                  >
                    <Cancel01Icon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirmTransfers}
              disabled={
                pendingTransfers.length === 0 || transferMutation.isPending
              }
              className={primaryButtonClasses}
            >
              {transferMutation.isPending
                ? "Applying..."
                : `Confirm ${pendingTransfers.length} transfer(s)`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingTransfers([]);
                setTransferMode(false);
              }}
              className={secondaryButtonClasses}
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-text-secondary dark:text-white/40">
            Confirmed transfers are irreversible.
          </p>
        </div>
      )}

      <PitchView
        rows={rows}
        showPrice={showPrice}
        onSlotClick={handleSlotClick}
      />
      {benchSlots.length > 0 && (
        <BenchRow
          slots={benchSlots}
          showPrice={showPrice}
          onSlotClick={handleSlotClick}
          note={benchNote}
        />
      )}

      {!transferMode && (
        // Sticky only while actionable (building / unsaved changes) so the
        // idle "Squad saved" state never floats over the bench. Offsets
        // clear the fixed bottom nav on mobile.
        <div
          className={
            dirty || !squad ? "sticky bottom-20 z-10 lg:bottom-4" : ""
          }
        >
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending || (!dirty && Boolean(squad))}
            className={`w-full shadow-lg ${primaryButtonClasses}`}
          >
            {saveMutation.isPending
              ? "Saving..."
              : !squadComplete
                ? `Pick ${settings.squad_size - allIds(editor).length} more player(s)`
                : squad
                  ? dirty
                    ? "Save changes"
                    : "Squad saved"
                  : "Save squad"}
          </button>
        </div>
      )}

      {/* Player picker */}
      <PlayerPicker
        isOpen={picker != null}
        title={
          picker?.mode === "transferIn"
            ? `Replace ${playersById.get(picker.out)?.name ?? "player"}`
            : `Add a ${picker?.position ?? ""}`
        }
        players={poolData.players}
        fixedPosition={picker?.position ?? null}
        selectedIds={viewIds}
        disabledReason={addDisabledReason}
        onPick={handlePick}
        onClose={() => setPicker(null)}
      />

      {/* Player action sheet */}
      <AnimatePresence>
        {sheetPlayer && (
          <div className="fixed inset-0 z-[60]">
            <motion.button
              type="button"
              aria-label="Close"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetPlayerId(null)}
              // No blur: the highlighted swap partners on the pitch must stay
              // readable behind the sheet.
              className="absolute inset-0 w-full cursor-default bg-black/25"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="absolute inset-x-0 bottom-0 mx-auto max-w-lg space-y-3 rounded-t-3xl bg-white p-5 pb-8 shadow-xl dark:bg-surface-overlay"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center">
                    <PlayerPhoto
                      player={sheetPlayer}
                      className="size-12"
                      fallback={sheetPlayer.position}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-text-body dark:text-white">
                      {sheetPlayer.name}
                    </p>
                    <p className="text-xs text-text-secondary dark:text-white/50">
                      {sheetPlayer.position} · {sheetPlayer.nation} ·{" "}
                      {Number(sheetPlayer.price).toFixed(1)}m
                      {locked &&
                        ` · ${livePointsOf(Number(sheetPlayer.provider_player_id))} pts`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetPlayerId(null)}
                  aria-label="Close"
                  className="flex size-9 items-center justify-center rounded-full bg-accent-gray text-gray-900 dark:bg-white/5 dark:text-white"
                >
                  <Cancel01Icon className="size-4" />
                </button>
              </div>

              {(() => {
                const id = Number(sheetPlayer.provider_player_id);
                const inXI = !benchedSet.has(id);
                const eliminated = !sheetPlayer.is_active;
                const swaps = eligibleSwaps(id);
                return (
                  <div className="space-y-2">
                    {eliminated && (
                      <p className="flex items-start gap-2 rounded-xl bg-background-neutral px-4 py-3 text-xs text-text-secondary dark:bg-white/5 dark:text-white/60">
                        <AirplaneTakeOff01Icon className="mt-0.5 size-4 shrink-0 text-accent-red" />
                        <span>
                          {sheetPlayer.nation} is unavailable. This player
                          can&apos;t be subbed or made captain —{" "}
                          {buildMode
                            ? "remove them from your squad."
                            : "transfer them out when the window opens."}
                        </span>
                      </p>
                    )}
                    {!eliminated && inXI && view.captainId !== id && (
                      <button
                        type="button"
                        onClick={() => handleCaptain(id, "captain")}
                        className={`w-full ${secondaryButtonClasses}`}
                      >
                        Make captain (C)
                      </button>
                    )}
                    {!eliminated && inXI && view.viceId !== id && (
                      <button
                        type="button"
                        onClick={() => handleCaptain(id, "vice")}
                        className={`w-full ${secondaryButtonClasses}`}
                      >
                        Make vice-captain (V)
                      </button>
                    )}
                    {swaps.length > 0 && (
                      <div className="space-y-1">
                        <p className="pt-1 text-xs font-medium text-text-secondary dark:text-white/50">
                          {inXI ? "Swap with bench" : "Bring into the XI for"}
                        </p>
                        {swaps.map((otherId) => {
                          const other = playersById.get(otherId);
                          if (!other) return null;
                          return (
                            <button
                              key={otherId}
                              type="button"
                              onClick={() => handleSwap(id, otherId)}
                              className="flex w-full items-center gap-3 rounded-xl bg-background-neutral px-3 py-2 text-sm text-text-body transition-colors hover:bg-accent-gray dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center">
                                <PlayerPhoto
                                  player={other}
                                  className="size-8"
                                  fallback={other.position}
                                />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-left">
                                {other.name}{" "}
                                <span className="text-xs text-text-secondary dark:text-white/40">
                                  {other.position}
                                </span>
                              </span>
                              <ArrowDataTransferHorizontalIcon className="size-4 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {buildMode && (
                      <button
                        type="button"
                        onClick={() => handleRemove(id)}
                        className="min-h-11 w-full rounded-xl bg-background-accent-red px-4 py-2.5 text-sm font-medium text-text-accent-red transition-colors hover:bg-background-accent-red/70 dark:bg-accent-red/10 dark:text-accent-red dark:hover:bg-accent-red/20"
                      >
                        Remove from squad
                      </button>
                    )}
                    {locked && lockStateOf(id) === "locked" && (
                      <p className="flex items-center gap-1.5 text-xs text-text-secondary dark:text-white/50">
                        <SquareLock02Icon className="size-3.5 shrink-0" />
                        This player&apos;s match is in progress — they can&apos;t
                        be moved right now.
                      </p>
                    )}
                    {locked && lockStateOf(id) === "played" && (
                      <p className="flex items-center gap-1.5 text-xs text-text-secondary dark:text-white/50">
                        <Tick02Icon className="size-3.5 shrink-0 text-emerald-500" />
                        This player&apos;s match has finished — the points they
                        earned in your XI are banked for this round, even if
                        you bench them now.
                      </p>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
