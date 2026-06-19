"use client";

import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from "@hpke/core";
import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";

/**
 * Decrypts Privy wallet export HPKE payload (same parameters as Privy docs).
 */
export async function decryptStarknetExportHpke(
  privateKeyPkcs8Base64: string,
  encapsulatedKeyBase64: string,
  ciphertextBase64: string,
): Promise<string> {
  const suite = new CipherSuite({
    kem: new DhkemP256HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Chacha20Poly1305(),
  });

  const base64ToBuffer = (base64: string) =>
    Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64ToBuffer(privateKeyPkcs8Base64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );

  const recipient = await suite.createRecipientContext({
    recipientKey: privateKey,
    enc: base64ToBuffer(encapsulatedKeyBase64),
  });

  return new TextDecoder().decode(
    await recipient.open(base64ToBuffer(ciphertextBase64)),
  );
}
