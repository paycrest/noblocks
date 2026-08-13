import type { Metadata } from "next";
import { notFound } from "next/navigation";
import config from "@/app/lib/config";
import { PlayShell } from "@/app/components/play/PlayShell";

export const metadata: Metadata = config.fantasyCampaignEnded
  ? {
      title: "Noblocks Play — Premier League Fantasy",
      description:
        "This season of Noblocks Play has ended. Follow Noblocks on X for winners and the next campaign.",
    }
  : {
      title: "Noblocks Play — Premier League Fantasy",
      description:
        "Build your Premier League fantasy squad, climb the leaderboard and compete with friends in mini-leagues.",
    };

export default function PlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Feature-flagged: pre-launch the whole surface 404s (middleware mirrors
  // this for /api/play/*).
  if (!config.fantasyEnabled) notFound();

  return (
    <PlayShell campaignEnded={config.fantasyCampaignEnded}>{children}</PlayShell>
  );
}
