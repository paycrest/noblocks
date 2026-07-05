"use client";

/**
 * Share-your-rank card (F-13): renders the OG image from /api/play/og and
 * offers tweet-intent + native share. The OG route is built separately —
 * this component only consumes it.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NewTwitterIcon, Share08Icon } from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import { PlayCard, Skeleton, secondaryButtonClasses } from "./ui";

export const ShareRankCard = ({
  username,
  rank,
  points,
  referrals = 0,
  code,
}: {
  username: string;
  rank: number;
  points: number;
  /** Activated referrals — the card's second stat. */
  referrals?: number;
  code: string;
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  // Mobile gets the big portrait card (like the reference); wider screens
  // the 1200×630 banner that link previews use.
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const referralLink = `https://noblocks.xyz?ref=${code}`;
  // The portrait is a DiceBear character generated server-side from the
  // username — deterministic, so every manager keeps their own card art.
  const ogUrl = `/api/play/og?username=${encodeURIComponent(username)}&rank=${rank}&points=${points}&refs=${referrals}&code=${encodeURIComponent(code)}&layout=${wide ? "wide" : "card"}`;

  // A layout flip changes the image URL — show the skeleton again.
  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [ogUrl]);
  const shareText = `I'm ranked #${rank} on Noblocks Play ⚽ Join my league: ${referralLink}`;

  const handleNativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Noblocks Play", text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        toast.success("Share text copied to clipboard");
      }
      trackEvent("referral_link_shared", { source: "rank_card", rank });
    } catch {
      // user dismissed the share sheet — not an error
    }
  };

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <PlayCard className="space-y-3">
      <h2 className="text-base font-semibold text-text-body dark:text-white">
        Share your rank
      </h2>

      {!imageFailed && (
        <div className="overflow-hidden rounded-xl border border-border-light dark:border-white/10">
          {!imageLoaded && (
            <Skeleton
              className={
                wide
                  ? "aspect-[1200/630] w-full"
                  : "mx-auto aspect-[2/3] w-full max-w-[320px]"
              }
            />
          )}
          {/* Dynamic OG endpoint image — next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={ogUrl}
            src={ogUrl}
            alt={`${username} is ranked #${rank} on Noblocks Play with ${points} points`}
            className={`${wide ? "w-full" : "mx-auto w-full max-w-[320px]"} ${imageLoaded ? "" : "hidden"}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackEvent("referral_link_shared", { source: "tweet", rank })
          }
          className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
        >
          <NewTwitterIcon className="size-4" />
          Post on X
        </a>
        <button
          type="button"
          onClick={handleNativeShare}
          className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
        >
          <Share08Icon className="size-4" />
          Share
        </button>
      </div>
    </PlayCard>
  );
};
