import {
  PrivyClient,
  LinkedAccountWithMetadata,
  WalletWithMetadata,
} from "@privy-io/server-auth";

let client: PrivyClient | undefined

export function getPrivyClient(): PrivyClient {
  if (client) return client
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) throw new Error('Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET')
  client = new PrivyClient(appId, appSecret)
  const authKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY
  if (authKey) {
    try {
      client.walletApi.updateAuthorizationKey(authKey)
    } catch (e: any) {
      console.warn('Failed to set Privy wallet authorization key:', e?.message)
    }
  }
  return client
}

function isWalletAccount(
  account: LinkedAccountWithMetadata,
): account is WalletWithMetadata {
  return account.type === "wallet";
}

export async function getWalletAddressFromPrivyUserId(
  userId: string,
): Promise<string> {
  const privy = getPrivyClient();
  try {
    const user = await privy.getUser(userId);
    if (!user || !user.linkedAccounts) {
      throw new Error("No linked accounts found for Privy user");
    }
    const wallet =
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          isWalletAccount(account) && account.connectorType === "embedded",
      ) ||
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          isWalletAccount(account) && account.chainId === "eip155:1",
      );
    if (!wallet?.address) {
      throw new Error("No embedded or Ethereum wallet found for Privy user");
    }

    return wallet.address.toLowerCase();
  } catch (error) {
    throw error;
  }
}

export async function getSmartWalletAddressFromPrivyUserId(
  userId: string,
): Promise<string> {
  const privy = getPrivyClient();
  try {
  const user = await privy.getUser(userId);
  const smartWalletAddress =
    user?.linkedAccounts.find((account) => account.type === "smart_wallet")
      ?.address ?? "";

  if (!smartWalletAddress) {
    throw new Error("No smart wallet found for Privy user");
  }
    return smartWalletAddress.toLowerCase();
  } catch (error) {
    throw error;
  }
}

const EVM_ADDRESS_LOWER = /^0x[a-f0-9]{40}$/;

/**
 * All lowercase 0x-prefixed EVM addresses linked to this Privy user (wallets,
 * smart wallets, injected wallets, etc.). Used to authorize API bodies where
 * the active signer differs from the middleware "primary" wallet (e.g. SCW vs EOA).
 */
export async function collectLinkedEvmAddressesForPrivyUserId(
  userId: string,
): Promise<string[]> {
  const privy = getPrivyClient();
  const user = await privy.getUser(userId);
  const addresses = new Set<string>();
  for (const account of user?.linkedAccounts ?? []) {
    const addrCandidate =
      account &&
      typeof account === "object" &&
      "address" in account &&
      typeof (account as { address: unknown }).address === "string"
        ? ((account as { address: string }).address).toLowerCase()
        : null;
    if (addrCandidate && EVM_ADDRESS_LOWER.test(addrCandidate)) {
      addresses.add(addrCandidate);
    }
  }
  return [...addresses];
}
