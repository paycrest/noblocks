/**
 * Pure helpers shared by app/lib/encryption.ts and
 * scripts/reencrypt-encryption-key.ts. No imports on purpose: the app module
 * pulls in the server-only Supabase client, which throws outside Next.js, and
 * the rotation script runs under tsx.
 */

export type EncryptionEnv = {
    ENCRYPTION_KEY?: string;
    ENCRYPTION_KEY_FALLBACK?: string;
};

/** pgcrypto raises exactly this message when the passphrase does not match. */
const WRONG_KEY_PATTERN = /wrong key|corrupt data/i;

/** True when the error is pgcrypto rejecting the passphrase, not a transport or schema failure. */
export function isWrongKeyError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && WRONG_KEY_PATTERN.test(message);
}

/** The key new ciphertext is written with. Throws when unset so a blank key never reaches pgcrypto. */
export function resolveEncryptKey(env: EncryptionEnv): string {
    const key = env.ENCRYPTION_KEY?.trim();
    if (!key) throw new Error('ENCRYPTION_KEY is not set');
    return key;
}

/**
 * Keys to try on decrypt, in order: primary, then fallback when it is set and
 * differs from the primary. Blank entries are dropped.
 */
export function resolveDecryptKeys(env: EncryptionEnv): string[] {
    const primary = resolveEncryptKey(env);
    const fallback = env.ENCRYPTION_KEY_FALLBACK?.trim();
    if (fallback && fallback !== primary) return [primary, fallback];
    return [primary];
}
