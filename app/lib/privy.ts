import { PrivyClient, LinkedAccountWithMetadata, WalletWithMetadata } from '@privy-io/server-auth';

export function getPrivyClient(): PrivyClient {
    return new PrivyClient(
        process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
        process.env.PRIVY_APP_SECRET!
    );
}


function isWalletAccount(account: LinkedAccountWithMetadata): account is WalletWithMetadata {
    return account.type === 'wallet';
}

export async function getWalletAddressFromPrivyUserId(userId: string): Promise<string> {
    const privy = getPrivyClient();
    try {
        const user = await privy.getUser(userId);
        if (!user || !user.linkedAccounts) {
            throw new Error('No linked accounts found for Privy user');
        }
        const wallet = user.linkedAccounts.find(
            (account): account is WalletWithMetadata =>
                isWalletAccount(account) && account.connectorType === 'embedded'
        ) || user.linkedAccounts.find(
            (account): account is WalletWithMetadata =>
                isWalletAccount(account) && account.chainId === 'eip155:1'
        );
        if (!wallet?.address) {
            throw new Error('No embedded or Ethereum wallet found for Privy user');
        }

        return wallet.address.toLowerCase();
    } catch (error) {
        throw error;
    }
}