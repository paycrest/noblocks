import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions — Noblocks Play",
  description:
    "Terms and conditions for Noblocks Play Premier League fantasy.",
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="space-y-2">
    <h2 className="text-base font-semibold text-text-body dark:text-white">
      {title}
    </h2>
    <div className="space-y-2 text-sm leading-relaxed text-text-secondary dark:text-white/60">
      {children}
    </div>
  </section>
);

export default function PlayTermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 pb-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-text-body dark:text-white">
          Noblocks Play — Terms &amp; Conditions
        </h1>
        <p className="text-sm text-text-secondary dark:text-white/50">
          Premier League 2026/27 fantasy season. By joining you accept these
          terms. You must be at least 18 years old.
        </p>
      </header>

      <Section title="1. The game">
        <p>
          Noblocks Play is a free-to-play fantasy football game covering the
          English Premier League 2026/27 season (Gameweeks 1–38). You build a
          15-player squad (2 goalkeepers, 5 defenders, 5 midfielders, 3
          forwards) within a £100m budget, with at most 3 players from any one
          club. You pick a starting XI, captain and vice-captain before each
          gameweek deadline (first kickoff minus 90 minutes). Points are based
          on real match performances. There is one global leaderboard; you may
          also create or join private mini-leagues with friends.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <p>
          You must be at least <strong>18 years old</strong> and have a Noblocks
          account in good standing. The game is void where prohibited by law. It
          is your responsibility to ensure that participating is lawful in your
          jurisdiction. Noblocks employees and contractors directly involved in
          operating the game may be excluded from separate marketing promotions
          at Noblocks&apos; discretion.
        </p>
      </Section>

      <Section title="3. Promotions">
        <p>
          Noblocks Play itself has <strong>no built-in prize pool or guaranteed
          rewards</strong>. From time to time, Noblocks may run separate
          marketing promotions, giveaways or campaigns — on social media, email,
          or elsewhere — with their own rules, eligibility, amounts and payout
          methods. Those promotions are independent of the scoring engine and
          leaderboard; they are not part of these game terms unless we publish
          separate promotion-specific terms that say otherwise.
        </p>
      </Section>

      <Section title="4. Game rules">
        <p>
          Scoring follows Fantasy Premier League–style conventions as configured
          in the product (appearance, goals, assists, clean sheets, goals
          conceded per two, saves, cards, own goals, penalty miss/save,
          defensive contribution thresholds, auto-subs, and captain/vice
          doubling). Deliberate differences and product rules include:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>No chips</strong> (no wildcard, free hit, bench boost, or
            triple captain).
          </li>
          <li>
            Free transfers bank up to <strong>5</strong>; each transfer beyond
            your remaining free transfers costs <strong>4 points</strong>.
          </li>
          <li>
            Deadlines are first kickoff of the gameweek minus 90 minutes, with a
            freeze window as operated by the scoring worker.
          </li>
          <li>
            <strong>Noblocks Match Bonus</strong> awards +3/+2/+1 to the top
            performers in our proprietary ranking for a fixture — not identical
            to official FPL bonus points.
          </li>
          <li>
            Player photos and club crests, when shown, are for identification
            only and do not imply endorsement.
          </li>
        </ul>
        <p>
          Deadlines use server time. Statistics come from a third-party data
          provider; scores may be adjusted during reconciliation and are final
          once a gameweek is marked final.
        </p>
      </Section>

      <Section title="5. Fair play, anti-fraud and disqualification">
        <p>
          Multiple accounts per person, identity farming, fabricated mini-leagues,
          wash activity, offensive usernames, and any other manipulation are
          prohibited. Noblocks may disqualify, remove from leaderboards, or rename
          any participant it reasonably believes has violated these terms.
          Scoring and eligibility decisions for the game are final.
        </p>
      </Section>

      <Section title="6. Non-affiliation">
        <p>
          Noblocks Play is an independent promotional fantasy game. It is{" "}
          <strong>not affiliated with, endorsed by, or connected to</strong> the
          Premier League, the Football Association, Fantasy Premier League, FIFA,
          any Premier League club, or any player. All club names, crests and
          player likenesses remain the property of their respective owners and
          are used only to identify real-world footballers for gameplay.
        </p>
      </Section>

      <Section title="7. General">
        <p>
          Noblocks may amend these terms, adjust scoring rules, or suspend or end
          the game for legal, technical or fairness reasons; material changes
          will be reflected on this page. Personal data is handled per the{" "}
          <Link
            href="/privacy-policy"
            className="text-lavender-500 underline hover:text-lavender-600"
          >
            Privacy Policy
          </Link>
          . For questions contact support through the Noblocks app.
        </p>
      </Section>
    </article>
  );
}
