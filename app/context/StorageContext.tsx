import { createHelia } from "helia";
import { dagJson } from "@helia/dag-json";
import { useState, useEffect, createContext, useContext } from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { CID } from "multiformats/cid";
import { useInjectedWallet } from "./InjectedWalletContext";

/**
 * Type definition for the Storage Context
 */
type StorageContextType = {
  save: (key: string, data: any) => Promise<string>;
  retrieve: (key: string) => Promise<any>;
  isInitialized: boolean;
} | null;

const StorageContext = createContext<StorageContextType>(null);

/**
 * StorageProvider component
 * Encrypted storage using IPFS with wallet-derived keys
 */
export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [helia, setHelia] = useState<any>(null);
  const [dag, setDag] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { wallets } = useWallets();
  const { signMessage } = usePrivy();
  const { isInjectedWallet, injectedAddress, injectedProvider } =
    useInjectedWallet();

  // Initialize Helia on component mount
  useEffect(() => {
    const init = async () => {
      try {
        const heliaNode = await createHelia();
        const dagInstance = dagJson(heliaNode);

        setHelia(heliaNode);
        setDag(dagInstance);
        setIsInitialized(true);
        console.log("Helia initialized successfully");
      } catch (error) {
        console.error("Failed to initialize Helia:", error);
      }
    };

    init();
  }, []);

  /**
   * Get the wallet address to use for storage
   */
  const getWalletAddress = (): string => {
    if (isInjectedWallet && injectedAddress) {
      return injectedAddress;
    }

    const embeddedWallet = wallets.find(
      (wallet) => wallet.walletClientType === "privy",
    );
    if (!embeddedWallet?.address) {
      throw new Error("No wallet address available");
    }

    return embeddedWallet.address;
  };

  /**
   * Sign a message to derive an encryption key
   * @param message - Message to sign
   * @returns Signature string
   */
  const signForEncryption = async (message: string): Promise<string> => {
    // Make sure we use the EXACT same message for encryption and decryption
    // Add a specific salt to make sure the message is consistent
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
   * @param signature - Wallet signature
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

    // Use PBKDF2 to derive a key suitable for AES-GCM
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
   * @param data - Data to encrypt
   * @param key - Encryption key
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

    console.log("Data encrypted", encrypted);
    console.log("IV", iv);
    console.log("Encrypted data", new Uint8Array(encrypted));

    return {
      iv: Array.from(iv),
      encryptedData: Array.from(new Uint8Array(encrypted)),
    };
  };

  /**
   * Decrypt data using AES-GCM
   * @param encrypted - Encrypted data object
   * @param key - Decryption key
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

    console.log("Data decrypted", decrypted);

    return JSON.parse(decoder.decode(decrypted));
  };

  /**
   * Save encrypted data to IPFS
   * @param key - Storage key
   * @param data - Data to store
   * @returns CID string of stored data
   */
  const save = async (key: string, data: any): Promise<string> => {
    if (!isInitialized || !dag) {
      throw new Error("Storage not initialized");
    }

    try {
      const walletAddress = getWalletAddress();

      // Important: Use a CONSISTENT message for encryption
      // Don't include dynamic elements like timestamps
      const message = `Encrypt data for ${key} with wallet ${walletAddress.toLowerCase()}`;

      // Log the exact message being used (helpful for debugging)
      console.log("Encryption message:", message);

      const signature = await signForEncryption(message);
      console.log(
        "Signature for encryption:",
        signature.substring(0, 10) + "...",
      );

      // Derive an encryption key from the signature
      const encryptionKey = await deriveEncryptionKey(signature);

      // Encrypt the data
      const encrypted = await encryptData(data, encryptionKey);

      // Store encrypted data in IPFS
      const cid = await dag.add(encrypted);
      console.log(
        `Data encrypted and stored in IPFS with CID: ${cid.toString()}`,
      );

      // Store a mapping of the key to the CID for easier retrieval
      const storageKey = `noblocks-data-${walletAddress.toLowerCase()}-${key}`;
      localStorage.setItem(storageKey, cid.toString());
      console.log(
        `CID stored in localStorage as ${storageKey}: ${cid.toString()}`,
      );

      return cid.toString();
    } catch (error) {
      console.error("Error saving data:", error);
      throw error instanceof Error
        ? new Error(`Failed to save data: ${error.message}`)
        : new Error(`Failed to save data`);
    }
  };

  /**
   * Retrieve and decrypt data from IPFS
   * @param key - Storage key
   * @returns Decrypted data
   */
  const retrieve = async (key: string): Promise<any> => {
    if (!isInitialized || !dag) {
      throw new Error("Storage not initialized");
    }

    try {
      const walletAddress = getWalletAddress();

      // Use the same message as in save - must match EXACTLY
      const message = `Encrypt data for ${key} with wallet ${walletAddress.toLowerCase()}`;

      // Log the exact message being used (helpful for debugging)
      console.log("Decryption message:", message);

      const signature = await signForEncryption(message);
      console.log(
        "Signature for decryption:",
        signature.substring(0, 10) + "...",
      );

      // Derive the decryption key
      const decryptionKey = await deriveEncryptionKey(signature);

      // Get CID from localStorage
      const storageKey = `noblocks-data-${walletAddress.toLowerCase()}-${key}`;
      const storedCidString = localStorage.getItem(storageKey);

      if (!storedCidString) {
        console.log(`No CID found for ${storageKey}`);
        throw new Error("No stored data found");
      }

      console.log(`Retrieved CID from localStorage: ${storedCidString}`);

      try {
        // Parse the CID string to a CID object
        const cid = CID.parse(storedCidString);

        // Retrieve encrypted data from IPFS
        const encryptedData = await dag.get(cid);

        if (!encryptedData) {
          throw new Error("Failed to retrieve encrypted data from IPFS");
        }

        // Verify the encrypted data structure before decryption
        if (!encryptedData.iv || !encryptedData.encryptedData) {
          console.error("Invalid encrypted data format:", encryptedData);
          throw new Error("Invalid encrypted data format");
        }

        // Decrypt the data with detailed error handling
        try {
          const decryptedData = await decryptData(encryptedData, decryptionKey);
          console.log("Data successfully decrypted");
          return decryptedData;
        } catch (decryptError) {
          console.error("Decryption failed with error:", decryptError);
          console.log(
            "Encrypted data format:",
            JSON.stringify(encryptedData).substring(0, 100) + "...",
          );
          throw new Error(
            `Decryption failed: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
          );
        }
      } catch (cidError) {
        console.error("Error parsing CID or retrieving data:", cidError);
        throw new Error(
          `Failed to retrieve data: ${cidError instanceof Error ? cidError.message : String(cidError)}`,
        );
      }
    } catch (error) {
      console.error("Error retrieving data:", error);
      throw error instanceof Error
        ? new Error(`Failed to retrieve data: ${error.message}`)
        : new Error(`Failed to retrieve data`);
    }
  };

  return (
    <StorageContext.Provider value={{ save, retrieve, isInitialized }}>
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Hook to access the storage context
 */
export const useStorage = (): StorageContextType => useContext(StorageContext);
