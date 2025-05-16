import { jwtVerify, createRemoteJWKSet } from 'jose';
import { JWTPayload, JWTProviderConfig, VerifyJWTResult } from '@/app/types';

/**
 * Verifies a JWT token for either Privy or Thirdweb provider
 * @param token - The JWT token to verify
 * @param config - Configuration for the JWT provider
 * @returns The verified payload and provider
 * @throws Error if verification fails
 */
export async function verifyJWT(token: string, config: JWTProviderConfig): Promise<VerifyJWTResult> {
    try {
        if (config.provider === 'privy' && config.privy) {
            const jwks = createRemoteJWKSet(new URL(config.privy.jwksUrl));
            const { payload } = await jwtVerify(token, jwks, {
                issuer: config.privy.issuer,
                algorithms: config.privy.algorithms,
            });

            return {
                payload: payload as JWTPayload,
                provider: config.provider,
            };
        } else if (config.provider === 'thirdweb' && config.thirdweb) {
            // Placeholder for thirdweb JWT verification
            // TODO: Thirdweb verification will be implemented when ready to migrate
            throw new Error('Thirdweb JWT verification not implemented yet');

        } else {
            throw new Error('Invalid JWT provider configuration');
        }
    } catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('jwt expired')) {
                throw new Error('JWT has expired');
            }
            if (error.message.includes('invalid signature')) {
                throw new Error('Invalid JWT signature');
            }
            if (error.message.includes('jwks_error')) {
                throw new Error('Failed to fetch JWKS from Privy');
            }
        }
        throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'} `);
    }
}
