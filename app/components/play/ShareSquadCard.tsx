"use client";

/**
 * Share-your-squad card on /play/team: previews the squad snapshot from
 * /api/play/og?layout=squad and shares the public team page
 * (/play/manager/[username]) with the #NoblocksPlay hashtag — X unfurls
 * that link into the snapshot. Renders nothing until the manager has a
 * squad in a locked round (open-round picks stay private).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NewTwitterIcon, Share08Icon } from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import { useManagerTeam } from "./hooks";
import { PlayCard, Skeleton, secondaryButtonClasses } from "./ui";

export const ShareSquadCard = ({ username }: { username: string }) => {
  const { data: manager } = useManagerTeam(username);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const ogUrl = manager
    // Bump `v` whenever the card art changes — share images are cached by CDNs
    // and by the social networks that scraped them.
    ? `/api/play/og?layout=squad&username=${encodeURIComponent(manager.username)}&v=faces`
    : null;
  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [ogUrl]);

  if (!manager?.team) return null;

  const pageUrl = `https://noblocks.xyz/play/manager/${encodeURIComponent(manager.username)}`;
  const shareText = `My ${manager.team.matchday.display_name} squad on Noblocks Play ⚽ ${manager.team.points} pts this round. Think you can beat me? #NoblocksPlay`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Noblocks Play",
          text: shareText,
          url: pageUrl,
        });
      } catch {
        // user dismissed the share sheet — not an error
        return;
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText} ${pageUrl}`);
        toast.success("Share text copied to clipboard");
      } catch {
        toast.error("Couldn't copy to clipboard — try the Post on X button");
        return;
      }
    }
    trackEvent("squad_shared", { source: "native" });
  };

  return (
    <PlayCard className="space-y-3">
      <h2 className="text-base font-semibold text-text-body dark:text-white">
        Share your squad
      </h2>

      {!imageFailed && ogUrl && (
        <div className="overflow-hidden rounded-xl border border-border-light dark:border-white/10">
          {!imageLoaded && <Skeleton className="aspect-[1200/630] w-full" />}
          {/* Dynamic OG endpoint image — next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={ogUrl}
            src={ogUrl}
            alt={`${manager.username}'s ${manager.team.matchday.display_name} squad on Noblocks Play`}
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
          onClick={() => trackEvent("squad_shared", { source: "tweet" })}
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
