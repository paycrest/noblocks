"use client";

/**
 * Share-your-rank card (F-13): renders the OG image from /api/play/og and
 * offers tweet-intent + native share. The OG route is built separately —
 * this component only consumes it.
 */

import { useState } from "react";
import { toast } from "sonner";
import { NewTwitterIcon, Share08Icon } from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import { PlayCard, Skeleton, secondaryButtonClasses } from "./ui";

export const ShareRankCard = ({
  username,
  rank,
  points,
  code,
}: {
  username: string;
  rank: number;
  points: number;
  code: string;
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const referralLink = `https://noblocks.xyz?ref=${code}`;
  const ogUrl = `/api/play/og?username=${encodeURIComponent(username)}&rank=${rank}&points=${points}&code=${encodeURIComponent(code)}`;
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
          {!imageLoaded && <Skeleton className="aspect-[1200/630] w-full" />}
          {/* Dynamic OG endpoint image — next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogUrl}
            alt={`${username} is ranked #${rank} on Noblocks Play with ${points} points`}
            className={`w-full ${imageLoaded ? "" : "hidden"}`}
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
