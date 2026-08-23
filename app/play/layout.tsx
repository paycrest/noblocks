import type { Metadata } from "next";
import { notFound } from "next/navigation";
import config from "@/app/lib/config";
import { PlayShell } from "@/app/components/play/PlayShell";
import { CampaignEnded } from "@/app/components/play/CampaignEnded";

export const metadata: Metadata = config.fantasyCampaignEnded
  ? {
      title: "Noblocks Play — Coming soon",
      description:
        "Premier League fantasy on Noblocks launches Wednesday 19 August 2026. Build your squad and compete with friends.",
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
  if (!config.fantasyEnabled) notFound();

  if (config.fantasyCampaignEnded) {
    return (
      <PlayShell prelaunch>
        <CampaignEnded />
      </PlayShell>
    );
  }

  return <PlayShell>{children}</PlayShell>;
}
