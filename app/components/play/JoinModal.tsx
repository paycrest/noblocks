"use client";

/**
 * Join-the-league modal: pick a permanent username (debounced availability
 * check + suggestions), accept the T&Cs, and POST /api/play/join. Handles the
 * 409 username race by surfacing the server's suggestions.
 *
 * With an `inviteCode` (arrived via a friend's mini-league link) the modal also
 * joins that league straight after, so the invite finishes in one pass instead
 * of dumping the user on /play/team with the code lost.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { DialogTitle } from "@headlessui/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CheckmarkCircle02Icon,
  Cancel01Icon,
  InformationCircleIcon,
} from "hugeicons-react";
import { AnimatedModal } from "../AnimatedComponents";
import { trackEvent } from "@/app/hooks/analytics/client";
import { PlayApiError, joinMiniLeague } from "./api";
import { playKeys, useJoinLeague, useUsernameAvailability } from "./hooks";
import { leagueJoinPath } from "./league-invite";
import { primaryButtonClasses } from "./ui";

export const JoinModal = ({
  isOpen,
  onClose,
  inviteCode = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Mini-league code from a `?join=` invite link, joined right after signup. */
  inviteCode?: string | null;
}) => {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // The invite redemption is awaited *after* onClose, so this component stays
  // mounted and reopenable while the request is in flight. The ref blocks a
  // second redemption; the state keeps the submit button disabled meanwhile.
  const [redeemingInvite, setRedeemingInvite] = useState(false);
  const redeemingInviteRef = useRef(false);

  const { result, checking } = useUsernameAvailability(username);
  const join = useJoinLeague();

  const trimmed = username.trim();
  const available = result?.available === true && trimmed.length >= 3;
  const unavailableReason =
    result && !result.available
      ? (result.reason ?? "That username is taken")
      : null;
  const liveSuggestions = suggestions.length
    ? suggestions
    : (result?.suggestions ?? []);

  const canSubmit =
    trimmed.length >= 3 &&
    acceptTerms &&
    available &&
    !join.isPending &&
    !redeemingInvite;

  /**
   * Redeem the invite the user arrived with. A bad or already-used code must not
   * strand a brand-new manager, so any failure still hands off to Leagues with
   * the code pre-filled rather than surfacing a dead end.
   */
  const joinInvitedLeague = async (code: string) => {
    if (redeemingInviteRef.current) return;
    redeemingInviteRef.current = true;
    setRedeemingInvite(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new PlayApiError("Unauthorized", 401);
      const { league } = await joinMiniLeague(code, token);
      await queryClient.invalidateQueries({ queryKey: playKeys.rewards });
      trackEvent("league_invite_redeemed", { league_id: league.id });
      toast.success(`Joined "${league.name}"`);
      router.push("/play/rewards");
    } catch (error) {
      toast.error(
        error instanceof PlayApiError
          ? error.message
          : "Couldn't join that league — try the code below.",
      );
      router.push(leagueJoinPath(code));
    } finally {
      redeemingInviteRef.current = false;
      setRedeemingInvite(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const data = await join.mutateAsync({
        username: trimmed,
        acceptTerms: true,
      });
      if (!data.already_joined) {
        trackEvent("username_created", { username: data.username });
      }
      trackEvent("league_joined", {
        username: data.username,
        already_joined: data.already_joined,
      });
      toast.success(
        data.already_joined
          ? "You're already in the league!"
          : `Welcome to the league, ${data.username}!`,
      );
      onClose();

      if (inviteCode) {
        await joinInvitedLeague(inviteCode);
        return;
      }

      router.push("/play/team");
    } catch (error) {
      if (error instanceof PlayApiError) {
        if (error.code === "USERNAME_TAKEN" && error.suggestions) {
          setSuggestions(error.suggestions);
        }
        toast.error(error.message);
      } else {
        toast.error("Failed to join the league. Please try again.");
      }
    }
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} maxWidth="28.5rem">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        <DialogTitle className="text-lg font-semibold text-text-body dark:text-white">
          Pick your league username
        </DialogTitle>

        <div className="w-full space-y-1 rounded-xl bg-background-neutral px-4 py-3 dark:bg-white/5">
          <label
            htmlFor="play-username"
            className="text-sm font-medium text-text-secondary dark:text-white/50"
          >
            Username
          </label>
          <div className="flex items-center gap-2">
            <input
              id="play-username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setSuggestions([]);
              }}
              placeholder="e.g. golazo_gee"
              maxLength={20}
              autoComplete="off"
              autoFocus
              disabled={join.isPending || redeemingInvite}
              className="w-full border-0 bg-transparent pt-1 text-base font-medium text-text-body placeholder:text-text-placeholder focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-white/30"
            />
            {trimmed.length >= 3 &&
              (checking ? (
                <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-lavender-500 border-t-transparent" />
              ) : available ? (
                <CheckmarkCircle02Icon className="size-5 shrink-0 text-emerald-500" />
              ) : unavailableReason ? (
                <Cancel01Icon className="size-5 shrink-0 text-accent-red" />
              ) : null)}
          </div>
        </div>

        {unavailableReason && (
          <p className="text-sm text-text-accent-red dark:text-accent-red">
            {unavailableReason}
          </p>
        )}

        {liveSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {liveSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setUsername(suggestion);
                  setSuggestions([]);
                }}
                className="rounded-full bg-lavender-100 px-3 py-1.5 text-xs font-medium text-lavender-800 transition-colors hover:bg-lavender-200 dark:bg-lavender-500/15 dark:text-lavender-300 dark:hover:bg-lavender-500/25"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <p className="flex items-start gap-2 text-xs text-text-secondary dark:text-white/50">
          <InformationCircleIcon className="mt-0.5 size-4 shrink-0" />
          Your username is public on the leaderboard and can&apos;t be changed
          later. 3–20 characters, letters, numbers and underscores.
        </p>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-text-body dark:text-white">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded accent-[#8B85F4]"
          />
          <span>
            I accept the{" "}
            <Link
              href="/play/terms"
              target="_blank"
              className="font-medium text-lavender-500 underline hover:text-lavender-600"
            >
              Noblocks Play Terms &amp; Conditions
            </Link>
          </span>
        </label>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full ${primaryButtonClasses}`}
        >
          {redeemingInvite
            ? "Joining your league..."
            : join.isPending
              ? "Joining..."
              : "Join the league"}
        </button>
      </motion.div>
    </AnimatedModal>
  );
};
