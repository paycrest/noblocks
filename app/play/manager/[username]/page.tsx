import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicManagerTeam } from "@/app/lib/fantasy/server";
import { ManagerTeamView } from "@/app/components/play/ManagerTeamView";

/**
 * /play/manager/[username] — public, read-only view of a manager's team
 * (latest locked round). Also the share target for squad snapshots: its OG
 * image is the squad card, so links unfurl the pitch on X.
 */

export const dynamic = "force-dynamic";

// Dedupe the lookup between generateMetadata and the page render. Returns
// null only for a genuinely unknown manager; backend failures propagate so
// an outage surfaces as a 500, not a misleading 404.
const getManager = cache((username: string) => getPublicManagerTeam(username));

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const manager = await getManager(decodeURIComponent(username));
  if (!manager) return { title: "Manager not found — Noblocks Play" };

  const title = `${manager.username}'s squad — Noblocks Play`;
  const description = manager.team
    ? `${manager.team.matchday.display_name}: ${manager.team.points} pts · ranked #${manager.rank ?? "—"} in the World Cup fantasy league. #NoblocksPlay`
    : `Ranked #${manager.rank ?? "—"} in the Noblocks Play World Cup fantasy league. #NoblocksPlay`;
  const image = `/api/play/og?layout=squad&username=${encodeURIComponent(manager.username)}`;

  return {
    title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ManagerPage({ params }: Props) {
  const { username } = await params;
  const manager = await getManager(decodeURIComponent(username));
  if (!manager) notFound();

  return <ManagerTeamView manager={manager} />;
}
