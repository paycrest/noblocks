import { useState, createContext, useContext } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useInjectedWallet } from "./InjectedWalletContext";
import { pinata } from "@/app/lib/pinata-config";

/**
 * Type definition for the Storage Context
 */
type StorageContextType = {
  save: (key: string, data: any) => Promise<string>;
  retrieve: (
    key: string,
    options?: {
      force?: boolean;
      directCid?: string;
    },
  ) => Promise<any>;
  isInitialized: boolean;
  isLoading: boolean;
} | null;

const StorageContext = createContext<StorageContextType>(null);

/**
 * StorageProvider component - Pinata-based storage
 */
export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(true); // Pinata is ready immediately
  const [isLoading, setIsLoading] = useState(false);

  // Wallet-related hooks
  const { wallets } = useWallets();
  const { signMessage } = usePrivy();
  const { isInjectedWallet, injectedAddress, injectedProvider } =
    useInjectedWallet();

  /**
   * Get the wallet address to use for storage
   */
  const getWalletAddress = (): string => {
    if (isInjectedWallet && injectedAddress) {
      return injectedAddress.toLowerCase();
    }

    const embeddedWallet = wallets.find(
      (wallet) => wallet.walletClientType === "privy",
    );
    if (!embeddedWallet?.address) {
      throw new Error("No wallet address available");
    }

    return embeddedWallet.address.toLowerCase();
  };

  /**
   * Sign a message to derive an encryption key
   */
  const signForEncryption = async (message: string): Promise<string> => {
    const saltedMessage = `noblocks-storage:${message}`;

    if (isInjectedWallet && injectedProvider) {
      try {
        const accounts = await injectedProvider.request({
          method: "eth_requestAccounts",
        });

        const signResult = await injectedProvider.request({
          method: "personal_sign",
          params: [
            `0x${Buffer.from(saltedMessage).toString("hex")}`,
            accounts[0],
          ],
        });

        return signResult;
      } catch (error) {
        console.error("Injected wallet signature error:", error);
        throw new Error("Failed to sign message with injected wallet");
      }
    } else {
      const signResult = await signMessage(
        { message: saltedMessage },
        { uiOptions: { buttonText: "Sign for encryption" } },
      );

      if (!signResult) {
        throw new Error("User denied signature request");
      }

      return signResult.signature;
    }
  };

  /**
   * Derive an encryption key from a signature
   */
  const deriveEncryptionKey = async (signature: string): Promise<CryptoKey> => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signature),
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("noblocks-secure-storage-salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  };

  /**
   * Encrypt data using AES-GCM
   */
  const encryptData = async (data: any, key: CryptoKey): Promise<object> => {
    const encoder = new TextEncoder();
    const dataStr = JSON.stringify(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(dataStr),
    );

    return {
      iv: Array.from(iv),
      encryptedData: Array.from(new Uint8Array(encrypted)),
    };
  };

  /**
   * Decrypt data using AES-GCM
   */
  const decryptData = async (encrypted: any, key: CryptoKey): Promise<any> => {
    const decoder = new TextDecoder();
    const iv = new Uint8Array(encrypted.iv);
    const encryptedData = new Uint8Array(encrypted.encryptedData);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData,
    );

    return JSON.parse(decoder.decode(decrypted));
  };

  /**
   * Save encrypted data using Pinata
   */
  const save = async (key: string, data: any): Promise<string> => {
    setIsLoading(true);
    try {
      const walletAddress = getWalletAddress();

      // Create a consistent message for encryption
      const message = `Encrypt data for ${key} with wallet ${walletAddress}`;
      console.log("Encryption message:", message);

      // Sign the message to get a signature
      const signature = await signForEncryption(message);

      // Derive an encryption key from the signature
      const encryptionKey = await deriveEncryptionKey(signature);

      // Encrypt the data
      const encrypted = await encryptData(data, encryptionKey);

      // Convert encrypted data to JSON and create a Blob
      const jsonBlob = new Blob([JSON.stringify(encrypted)], {
        type: "application/json",
      });
      const file = new File([jsonBlob], `${key}-${walletAddress}.json`, {
        type: "application/json",
      });

      // Upload to Pinata
      const { cid } = await pinata.upload.public.file(file);
      console.log(`Data encrypted and stored with CID: ${cid}`);

      // Store a local cache of the CID for faster retrieval
      const storageKey = `eth-${walletAddress}-${key}`;
      localStorage.setItem(storageKey, cid);

      return cid;
    } catch (error) {
      console.error("Error saving data:", error);
      throw error instanceof Error
        ? new Error(`Failed to save data: ${error.message}`)
        : new Error(`Failed to save data`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Retrieve and decrypt data using Pinata
   */
  const retrieve = async (
    key: string,
    options?: {
      force?: boolean;
      directCid?: string;
    },
  ): Promise<any> => {
    setIsLoading(true);
    try {
      const walletAddress = getWalletAddress();

      // Create the same message as in save for consistent key derivation
      const message = `Encrypt data for ${key} with wallet ${walletAddress}`;
      console.log("Decryption message:", message);

      // Use the same signature process to derive the same key
      const signature = await signForEncryption(message);
      const decryptionKey = await deriveEncryptionKey(signature);

      let cidToUse: string | null = null;

      // If directCid is provided, use it directly
      if (options?.directCid) {
        console.log(`Using provided direct CID: ${options.directCid}`);
        cidToUse = options.directCid;
      } else {
        // Check localStorage first
        const storageKey = `eth-${walletAddress}-${key}`;
        cidToUse = localStorage.getItem(storageKey);
      }

      if (!cidToUse) {
        throw new Error("No stored data found");
      }

      // Get the gateway URL for the CID
      const url = await pinata.gateways.public.convert(cidToUse);

      // Fetch the encrypted data
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch data from Pinata");
      }

      const encryptedData = await response.json();

      // Validate the encrypted data structure
      if (!encryptedData || !encryptedData.iv || !encryptedData.encryptedData) {
        throw new Error("Invalid encrypted data format");
      }

      // Decrypt the data
      const decryptedData = await decryptData(encryptedData, decryptionKey);
      return decryptedData;
    } catch (error) {
      console.error("Error retrieving data:", error);
      throw error instanceof Error
        ? new Error(`Failed to retrieve data: ${error.message}`)
        : new Error(`Failed to retrieve data`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StorageContext.Provider
      value={{ save, retrieve, isInitialized, isLoading }}
    >
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Hook to access the storage context
 */
export const useStorage = (): StorageContextType => useContext(StorageContext);
