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
    keysToRemove.push(`hasSeenNetworkModal-${walletAddress.toLowerCase()}`);
    keysToRemove.push(`recipientsMigrated-${walletAddress}`);
  }

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
