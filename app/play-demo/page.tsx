import { notFound } from "next/navigation";
import { DemoShell } from "@/app/components/play/demo/DemoShell";

export const metadata = {
  title: "Noblocks Play — Demo",
  robots: { index: false, follow: false },
};

/**
 * /play-demo — frontend-only simulator of the whole Play experience
 * (see app/components/play/demo/). Dev-only unless explicitly enabled with
 * NEXT_PUBLIC_FANTASY_DEMO=true, so it can never leak into production.
 */
export default function PlayDemoPage() {
  const enabled =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_FANTASY_DEMO === "true";
  if (!enabled) notFound();
  return <DemoShell />;
}
