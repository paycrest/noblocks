/**
 * Clears all user-specific localStorage keys and transient session data on logout.
 * Must be called BEFORE Privy's logout() since user info is needed to build the keys.
 */
export function clearUserSessionData(userId?: string, walletAddress?: string) {
  const keysToRemove: string[] = [
    "userId",
    "currentTransactionId",
    "lastFundingAttempt",
    "fundingCallbackId",
  ];

  if (walletAddress) {
    const lowerAddress = walletAddress.toLowerCase();
    keysToRemove.push(`hasSeenNetworkModal-${lowerAddress}`);
    // recipientsMigrated uses the raw walletAddress stored in localStorage("userId")
    keysToRemove.push(`recipientsMigrated-${walletAddress}`);
  }

  // hasDismissedZeroBalanceMigration uses userId ?? walletAddress (no lowercasing)
  const migrationDismissalId = userId ?? walletAddress;
  if (migrationDismissalId) {
    keysToRemove.push(`hasDismissedZeroBalanceMigration-${migrationDismissalId}`);
  }

  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors (e.g. private browsing)
    }
  }
}
