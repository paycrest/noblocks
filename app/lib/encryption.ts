import { supabaseAdmin } from "@/app/lib/supabase";
import type { Recipient } from "@/app/types";

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 16) {
    throw new Error("ENCRYPTION_KEY is missing or invalid");
  }
  return key;
}

export async function encryptRecipientData(
  recipientData: Recipient,
): Promise<Buffer> {
  try {
    const { data, error } = await supabaseAdmin.rpc("encrypt_recipient_data", {
      recipient_json: JSON.stringify(recipientData),
      encryption_key: getEncryptionKey(),
    });

    if (error) throw error;
    return Buffer.from(data, "base64");
  } catch (error) {
    console.error("Error encrypting recipient data:", error);
    throw new Error("Failed to encrypt sensitive data");
  }
}

export async function decryptRecipientData(
  encryptedData: Buffer,
): Promise<Recipient> {
  try {
    const { data, error } = await supabaseAdmin.rpc("decrypt_recipient_data", {
      encrypted_data: encryptedData.toString("base64"),
      encryption_key: getEncryptionKey(),
    });

    if (error) throw error;
    if (!data) throw new Error("Decrypted data is null");

    return JSON.parse(data) as Recipient;
  } catch (error) {
    console.error("Error decrypting recipient data:", error);
    throw new Error("Failed to decrypt sensitive data");
  }
}
