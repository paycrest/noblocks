/**
 * Copy for the monthly spend limit.
 *
 * The limit belongs to a verified identity, so several wallets can draw from one
 * allowance (see `app/lib/kyc-identity.ts`). Someone with more than one wallet would
 * otherwise see spend their current wallet never made, so the pooled wording names the
 * wallet count wherever a limit or a block is shown.
 *
 * Every helper here returns the pre-pooling string verbatim when the identity spans a
 * single wallet: the majority of users are unaffected by pooling and must see no change.
 */

/** True when this identity's allowance is shared across more than one wallet. */
export function isPooledAllowance(pooledWalletCount: number | undefined): boolean {
  return (pooledWalletCount ?? 1) > 1;
}

/** e.g. "shared across your 3 wallets". Empty string when not pooled. */
export function sharedAllowanceNote(pooledWalletCount: number | undefined): string {
  return isPooledAllowance(pooledWalletCount)
    ? `shared across your ${pooledWalletCount} wallets`
    : "";
}

/**
 * Error shown when a swap is refused for exceeding the monthly limit. Callers pass the
 * resolved limit and the number of wallets sharing it.
 */
export function monthlyLimitReachedMessage(
  monthlyLimit: number,
  pooledWalletCount: number | undefined,
): string {
  const amount = `$${monthlyLimit.toLocaleString()}`;
  return isPooledAllowance(pooledWalletCount)
    ? `Monthly transaction limit of ${amount} reached across your ${pooledWalletCount} linked wallets. Upgrade your verification tier to continue.`
    : `Monthly transaction limit of ${amount} reached. Upgrade your verification tier to continue.`;
}
