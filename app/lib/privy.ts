import { PrivyClient } from '@privy-io/server-auth';

export function getPrivyClient(): PrivyClient {
    return new PrivyClient(
        process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
        process.env.NEXT_PRIVY_APP_SECRET!
    );
}

export async function getWalletAddressFromPrivyUserId(userId: string): Promise<string> {
    const privy = getPrivyClient();
    try {
        const user = await privy.getUser(userId);
        if (!user || !user.wallet?.address) {
            throw new Error('No wallet address found for Privy user');
        }
        return user.wallet.address.toLowerCase(); // Normalize to lowercase
    } catch (error) {
        console.error('Error fetching Privy user:', error);
        throw error;
    }
}

//  * Fetches the wallet address from a Privy user using an idToken (JWT).
//  * @param idToken - The Privy JWT token.
//  * @returns The wallet address associated with the user.
//  * @throws Error if no wallet address is found or the user cannot be retrieved.
//  */
// export async function getWalletAddressFromPrivyToken(idToken: string): Promise<string> {
//     const privy = getPrivyClient();
//     try {
//         const user = await privy.getUser({ idToken });
//         if (!user || !user.wallet?.address) {
//             throw new Error('No wallet address found for Privy user');
//         }
//         return user.wallet.address.toLowerCase(); // Normalize to lowercase
//     } catch (error) {
//         console.error('Error fetching Privy user:', error);
//         throw error;
//     }
// }