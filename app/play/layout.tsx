import type { Metadata } from "next";
import { notFound } from "next/navigation";
import config from "@/app/lib/config";
import { PlayShell } from "@/app/components/play/PlayShell";

export const metadata: Metadata = config.fantasyCampaignEnded
  ? {
      title: "Noblocks Play — World Cup Fantasy League",
      description:
        "The World Cup fantasy league has ended. Follow Noblocks on X for the winners announcement — Play returns for Premier League and Champions League.",
    }
  : {
      title: "Noblocks Play — World Cup Fantasy League",
      description:
        "Build your World Cup fantasy squad, climb the leaderboard and qualify for a share of 600 USDC on Base.",
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
