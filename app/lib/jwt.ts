import { jwtVerify, createRemoteJWKSet } from 'jose';

export interface JWTPayload {
    sub: string; // User ID (e.g., did:privy:...)
    [key: string]: any;
}

export interface VerifyJWTResult {
    payload: JWTPayload;
}

// Privy JWT verification configuration
const PRIVY_JWKS_URL = process.env.NEXT_PRIVY_JWKS_URL
const PRIVY_ISSUER = process.env.NEXT_PUBLIC_PRIVY_ISSUER;
const PRIVY_ALGORITHMS = ['ES256'];

/**
 * Verifies a Privy JWT token and returns the payload if valid
 */
export async function verifyJWT(token: string): Promise<VerifyJWTResult> {
    try {
        // Create JWKS (JSON Web Key Set) from Privy's public endpoint
        const jwks = createRemoteJWKSet(new URL(PRIVY_JWKS_URL || ""));

        // Verify the token
        const { payload } = await jwtVerify(token, jwks, {
            issuer: PRIVY_ISSUER,
            algorithms: PRIVY_ALGORITHMS,
        });

        return { payload: payload as JWTPayload };
    } catch (error) {
        // Handle specific error cases
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

        // Generic error case
        throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}