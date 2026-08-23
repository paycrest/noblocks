/** Mini-league invite link helpers (client + share sheet). */

export function leagueJoinPath(code: string): string {
  return `/play/rewards?join=${encodeURIComponent(code.trim().toUpperCase())}`;
}

export function leagueJoinUrl(code: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://noblocks.xyz");
  return `${base}${leagueJoinPath(code)}`;
}

export function leagueShareText(leagueName: string, code: string, origin?: string): string {
  const url = leagueJoinUrl(code, origin);
  return `Join "${leagueName}" on Noblocks Play ⚽ Code: ${code.toUpperCase()} — ${url}`;
}
