import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions — Noblocks Play",
  description:
    "Terms and conditions for the Noblocks Play World Cup 2026 fantasy league and 300 USDC giveaway.",
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
          World Cup 2026 Fantasy League &amp; 300 USDC giveaway. By joining
          the league you accept these terms.
        </p>
      </header>

      <Section title="1. The game">
        <p>
          Noblocks Play is a free-to-play fantasy football game covering the
          business end of the 2026 FIFA World Cup: the quarter-finals,
          semi-finals, and the Final round (including the third-place match).
          You build a 15-player squad (2 goalkeepers, 5 defenders, 5
          midfielders, 3 forwards) within the game budget, pick a starting XI,
          captain and vice-captain before each matchday locks, and score
          points based on real match performances. There is one global
          league; your username and rank are public on the leaderboard.
        </p>
      </Section>

      <Section title="2. Eligibility and geographic compliance">
        <p>
          You must have a Noblocks account in good standing to participate.
          The game and the giveaway are void where prohibited by law. It is
          your responsibility to ensure that participating in a promotional
          giveaway and receiving a prize is lawful in your jurisdiction;
          residents of jurisdictions where such promotions are restricted may
          play for bragging rights but are not eligible for prizes. Noblocks
          employees and contractors directly involved in operating the
          campaign are not eligible for prizes.
        </p>
      </Section>

      <Section title="3. Prizes">
        <p>
          The prize pool is <strong>300 USDC, paid on the Base network</strong>{" "}
          to the wallet associated with your Noblocks account:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Final leaderboard ranks 1–5 among qualified participants:{" "}
            <strong>40 USDC each</strong>.
          </li>
          <li>
            Final leaderboard ranks 6–10 among qualified participants:{" "}
            <strong>20 USDC each</strong>.
          </li>
        </ul>
        <p>
          Prize ranking counts <strong>qualified</strong> participants only:
          players who are not qualified (see §4) or who opted out of the
          giveaway are skipped when prizes are assigned. Ties are broken by
          total points, then by earlier join time, then by more activated
          referrals.
        </p>
      </Section>

      <Section title="4. Qualification (referral requirement)">
        <p>
          To be eligible for a prize you must, in addition to your leaderboard
          rank, refer <strong>5 friends who each activate</strong> before the
          qualification deadline of{" "}
          <strong>22 July 2026, 23:59:59 UTC (2026-07-22T23:59:59Z)</strong>.
        </p>
        <p>
          <strong>
            A referred friend activates when their cumulative total completed
            on-ramp and off-ramp transaction volume on Noblocks reaches $5
            (USD equivalent) within the campaign window.
          </strong>{" "}
          This is a cumulative threshold across all of their completed
          transactions — it does not need to be a single $5 transaction.
          Referral attribution uses the existing Noblocks referral system
          (your NB referral code / share link).
        </p>
        <p>
          Your fantasy points decide your rank; referrals decide whether you
          are prize-eligible. You can toggle giveaway participation on the
          Rewards page until the qualification deadline.
        </p>
      </Section>

      <Section title="5. Adapted game rules">
        <p>
          The scoring system is adapted from familiar fantasy football
          conventions with the following deliberate differences:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>No boosters or chips</strong> (no wildcard, bench boost,
            triple captain, or similar) are available.
          </li>
          <li>
            The <strong>bench is displayed but NEVER auto-substitutes</strong>.
            Bench players score no points unless you manually move them into
            your XI before their match kicks off.
          </li>
          <li>
            The <strong>vice-captain fallback is unconditional</strong>: it
            applies whenever the captain plays 0 minutes, regardless of the
            reason.
          </li>
          <li>
            <strong>Key passes substitute big-chances-created at the same
            2-for-1 rate</strong> (2 key passes = 1 point for midfielders).
          </li>
          <li>
            The <strong>direct free-kick goal bonus is best-effort</strong>:
            it may be awarded where our data feed identifies the goal type.
          </li>
          <li>
            <strong>Transfers are closed during a live round and reopen
            minutes after the round&apos;s last final whistle.</strong> Each
            round grants a number of free transfers; each transfer beyond
            them costs 3 points. Confirmed transfers are irreversible.
          </li>
          <li>
            During a live round, lineup and captaincy changes follow a
            rolling lockout: a player whose match is in progress or finished
            cannot be brought into the XI, and a player cannot be moved while
            their match is in progress. Points a player earns while in your
            XI are banked for the round — benching them afterwards does not
            remove those points.
          </li>
        </ul>
        <p>
          Deadlines are enforced with server time. Player statistics come
          from our third-party data provider; scores may be adjusted during a
          reconciliation window after each match and are final once the
          matchday is marked final.
        </p>
      </Section>

      <Section title="6. Fair play, anti-fraud and disqualification">
        <p>
          Self-referrals, referral farming with fabricated or bot accounts,
          wash transactions made to trigger activation thresholds, multiple
          accounts per person, and any other manipulation of the game or the
          referral system are prohibited. Noblocks reserves the right, at its
          sole discretion, to withhold prizes from, disqualify, or rename any
          participant it reasonably believes has violated these terms, abused
          the system, or chosen an offensive username. Decisions on scoring,
          qualification and prizes are final.
        </p>
      </Section>

      <Section title="7. Taxes">
        <p>
          Prizes may be taxable in your jurisdiction. You are solely
          responsible for reporting and paying any taxes, duties or levies
          that apply to a prize you receive.
        </p>
      </Section>

      <Section title="8. General">
        <p>
          Noblocks may amend these terms, adjust scoring rules, or suspend or
          end the campaign where required for legal, technical or fairness
          reasons; material changes will be reflected on this page. The
          campaign is not affiliated with, endorsed by, or connected to FIFA.
          Personal data is handled per the{" "}
          <Link
            href="/privacy-policy"
            className="text-lavender-500 underline hover:text-lavender-600"
          >
            Noblocks Privacy Policy
          </Link>
          ; your chosen username and rank are displayed publicly.
        </p>
      </Section>

      <p className="text-xs text-text-secondary dark:text-white/40">
        Last updated: 4 July 2026.
      </p>
    </article>
  );
}
