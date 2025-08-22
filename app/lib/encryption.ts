import { supabaseAdmin } from "@/app/lib/supabase";
import type { Recipient } from "@/app/types";

export async function encryptRecipientData(
  recipientData: Recipient,
): Promise<Buffer> {
  try {
    const { data, error } = await supabaseAdmin.rpc("encrypt_recipient_data", {
      recipient_json: JSON.stringify(recipientData),
      encryption_key: process.env.ENCRYPTION_KEY!,
    });

    if (error) throw error;

    // return Buffer.from(data, "base64");
    return Buffer.from(data as string, "base64");
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
      encryption_key: process.env.ENCRYPTION_KEY!,
    });

    if (error) throw error;
    if (!data) throw new Error("Decrypted data is null");

    // Type assertion and validation
    let decryptedString: string;

    if (typeof data === "string") {
      decryptedString = data;
    } else if (typeof data === "object" && data !== null) {
      // If RPC returns an object, check if it has the decrypted value
      decryptedString =
        (data as any).decrypted_data ||
        (data as any).result ||
        JSON.stringify(data);
    } else {
      throw new Error("Unexpected data type returned from decrypt function");
    }

    return JSON.parse(decryptedString) as Recipient;
  } catch (error) {
    console.error("Error decrypting recipient data:", error);
    throw new Error("Failed to decrypt sensitive data");
  }
}
