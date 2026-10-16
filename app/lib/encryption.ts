import { supabaseAdmin } from '@/app/lib/supabase';
import type { Recipient } from '@/app/types';
import {
    isWrongKeyError,
    resolveDecryptKeys,
    resolveEncryptKey,
} from '@/app/lib/encryption-keys';

export { isWrongKeyError, resolveDecryptKeys, resolveEncryptKey };

/**
 * Recipient PII encryption via the encrypt_recipient_data /
 * decrypt_recipient_data Postgres RPCs (pgcrypto, defined in
 * supabase/migrations/20261015130000_recipient_encryption_rpcs.sql).
 *
 * Key rotation contract:
 *   - ENCRYPTION_KEY is the only key ever used to encrypt.
 *   - Decrypt tries ENCRYPTION_KEY first, then ENCRYPTION_KEY_FALLBACK when the
 *     primary fails with a wrong-key error. That keeps the previous key readable
 *     while scripts/reencrypt-encryption-key.ts rewrites stored ciphertext,
 *     after which the fallback is removed. Runbook:
 *     scripts/reencrypt-encryption-key.md.
 *
 * Key material is never logged: PostgREST errors do not echo RPC arguments,
 * and the messages thrown below are fixed strings.
 */

/** The only two variables this module reads; listed literally so the .env.example drift test sees them. */
function encryptionEnv() {
    return {
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
        ENCRYPTION_KEY_FALLBACK: process.env.ENCRYPTION_KEY_FALLBACK,
    };
}

async function encryptWithKey(recipientJson: string, encryptionKey: string): Promise<string> {
    const { data, error } = await supabaseAdmin.rpc('encrypt_recipient_data', {
        recipient_json: recipientJson,
        encryption_key: encryptionKey,
    });
    if (error) throw error;
    if (typeof data !== 'string' || !data) throw new Error('Encrypted data is empty');
    return data;
}

async function decryptWithKey(encryptedBase64: string, encryptionKey: string): Promise<string> {
    const { data, error } = await supabaseAdmin.rpc('decrypt_recipient_data', {
        encrypted_data: encryptedBase64,
        encryption_key: encryptionKey,
    });
    if (error) throw error;
    if (typeof data !== 'string' || !data) throw new Error('Decrypted data is null');
    return data;
}

export async function encryptRecipientData(recipientData: Recipient): Promise<Buffer> {
    try {
        const encrypted = await encryptWithKey(
            JSON.stringify(recipientData),
            resolveEncryptKey(encryptionEnv()),
        );
        return Buffer.from(encrypted, 'base64');
    } catch (error) {
        console.error('Error encrypting recipient data:', error);
        throw new Error('Failed to encrypt sensitive data');
    }
}

export async function decryptRecipientData(encryptedData: Buffer): Promise<Recipient> {
    try {
        const encryptedBase64 = encryptedData.toString('base64');
        let lastError: unknown;

        for (const key of resolveDecryptKeys(encryptionEnv())) {
            try {
                const plaintext = await decryptWithKey(encryptedBase64, key);
                return JSON.parse(plaintext) as Recipient;
            } catch (error) {
                // Only a passphrase mismatch justifies trying the next key. A
                // missing RPC, network failure or malformed base64 would fail
                // identically under every key, so surface it immediately.
                if (!isWrongKeyError(error)) throw error;
                lastError = error;
            }
        }

        throw lastError ?? new Error('No decryption key matched');
    } catch (error) {
        console.error('Error decrypting recipient data:', error);
        throw new Error('Failed to decrypt sensitive data');
    }
}
