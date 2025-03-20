import { createHelia } from "helia";
import { dagJson } from "@helia/dag-json";
import { ipns } from "@helia/ipns";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { useState, useEffect, createContext, useContext } from "react";
import { CID } from "multiformats/cid";
import { toast } from "sonner";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useInjectedWallet } from "./InjectedWalletContext";

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
      useIpns?: boolean;
    },
  ) => Promise<any>;
  isInitialized: boolean;
  isLoading: boolean;
} | null;

const StorageContext = createContext<StorageContextType>(null);

/**
 * StorageProvider component - Wallet-encrypted storage with IPNS
 */
export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [helia, setHelia] = useState<any>(null);
  const [dagInstance, setDagInstance] = useState<any>(null);
  const [ipnsInstance, setIpnsInstance] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Store IPNS keys with their names
  const [ipnsKeys, setIpnsKeys] = useState<Record<string, any>>({});

  // Wallet-related hooks
  const { wallets } = useWallets();
  const { signMessage } = usePrivy();
  const { isInjectedWallet, injectedAddress, injectedProvider } =
    useInjectedWallet();

  // Initialize Helia on component mount
  useEffect(() => {
    const init = async () => {
      try {
        const heliaNode = await createHelia();
        const dagApi = dagJson(heliaNode);
        const ipnsApi = ipns(heliaNode);

        setHelia(heliaNode);
        setDagInstance(dagApi);
        setIpnsInstance(ipnsApi);
        setIsInitialized(true);
        console.log("Helia initialized with DAG JSON and IPNS support");
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
   * @param message - Message to sign
   * @returns Signature string
   */
  const signForEncryption = async (message: string): Promise<string> => {
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

    return JSON.parse(decoder.decode(decrypted));
  };

  /**
   * Generate or get an IPNS key for publishing
   * @param walletAddress - The user's wallet address
   * @param key - Storage key
   */
  const getIpnsKey = async (
    walletAddress: string,
    key: string,
  ): Promise<any> => {
    const ipnsKeyName = `eth-${walletAddress}-${key}`;

    // Check if we already have this key in memory
    let privateKey = ipnsKeys[ipnsKeyName];

    if (!privateKey) {
      // Generate a new key if none exists
      privateKey = await generateKeyPair("Ed25519");
      setIpnsKeys((prev) => ({ ...prev, [ipnsKeyName]: privateKey }));
      console.log(`Generated new IPNS key: ${ipnsKeyName}`);
    }

    return privateKey;
  };

  /**
   * Save encrypted data to IPFS and publish to IPNS
   * @param key - Storage key
   * @param data - Data to store
   * @returns CID string of stored data
   */
  const save = async (key: string, data: any): Promise<string> => {
    if (!isInitialized || !dagInstance || !ipnsInstance) {
      throw new Error("Storage not initialized");
    }

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

      // Store encrypted data in IPFS
      const cid = await dagInstance.add(encrypted);
      console.log(
        `Data encrypted and stored in IPFS with CID: ${cid.toString()}`,
      );

      // Get or create IPNS key
      const privateKey = await getIpnsKey(walletAddress, key);

      // Publish to IPNS
      await ipnsInstance.publish(privateKey, cid);
      console.log(`Published to IPNS with key: eth-${walletAddress}-${key}`);

      // Store a local cache of the CID for faster retrieval
      const storageKey = `eth-${walletAddress}-${key}`;
      localStorage.setItem(storageKey, cid.toString());

      return cid.toString();
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
   * Retrieve and decrypt data from IPFS/IPNS
   * @param key - Storage key
   * @param options - Options for retrieval
   * @returns Decrypted data
   */
  const retrieve = async (
    key: string,
    options?: {
      force?: boolean;
      directCid?: string;
      useIpns?: boolean;
    },
  ): Promise<any> => {
    if (!isInitialized || !dagInstance) {
      throw new Error("Storage not initialized");
    }

    setIsLoading(true);
    try {
      const walletAddress = getWalletAddress();

      // Create the same message as in save for consistent key derivation
      const message = `Encrypt data for ${key} with wallet ${walletAddress}`;
      console.log("Decryption message:", message);

      // Use the same signature process to derive the same key
      const signature = await signForEncryption(message);
      console.log("Decryption signature:", signature.substring(0, 20) + "...");

      const decryptionKey = await deriveEncryptionKey(signature);

      let cidToUse: string | null = null;

      // If directCid is provided, use it directly
      if (options?.directCid) {
        console.log(`Using provided direct CID: ${options.directCid}`);
        cidToUse = options.directCid;
      }
      // If useIpns is true, always try IPNS resolution
      else if (options?.useIpns && ipnsInstance) {
        try {
          console.log("Forcing IPNS resolution...");
          const privateKey = await getIpnsKey(walletAddress, key);
          console.log("Using IPNS key with publicKey:", privateKey.publicKey);

          // Resolve the latest CID from IPNS
          const result = await ipnsInstance.resolve(privateKey.publicKey);
          cidToUse = result.cid.toString();
          console.log(`Resolved IPNS to CID: ${cidToUse}`);

          // Update the cache
          if (cidToUse) {
            const storageKey = `eth-${walletAddress}-${key}`;
            localStorage.setItem(storageKey, cidToUse);
            console.log(`Updated localStorage with new CID: ${cidToUse}`);
          }
        } catch (error) {
          console.error("IPNS resolution failed:", error);
          throw new Error(
            `IPNS resolution failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      // Normal flow: check localStorage or use IPNS based on force flag
      else {
        // Check localStorage first for faster retrieval
        const storageKey = `eth-${walletAddress}-${key}`;
        const cachedCid = localStorage.getItem(storageKey);
        console.log(
          `Retrieved from localStorage key ${storageKey}: CID:`,
          cachedCid,
        );

        // If force is true or no cached CID, try to resolve from IPNS
        if (options?.force || !cachedCid) {
          if (ipnsInstance) {
            try {
              console.log(
                "No cached CID or force refresh, trying IPNS resolution",
              );
              // Get the IPNS key
              const privateKey = await getIpnsKey(walletAddress, key);
              console.log(
                "Using IPNS key with publicKey:",
                privateKey.publicKey,
              );

              // Resolve the latest CID from IPNS
              const result = await ipnsInstance.resolve(privateKey.publicKey);
              cidToUse = result.cid.toString();
              console.log(`Resolved IPNS to CID: ${cidToUse}`);

              // Update the cache
              if (cidToUse) {
                localStorage.setItem(storageKey, cidToUse);
                console.log(`Updated localStorage with new CID: ${cidToUse}`);
              }
            } catch (error) {
              console.warn(
                "IPNS resolution failed, falling back to cached CID:",
                error,
              );
              cidToUse = cachedCid;
            }
          } else {
            cidToUse = cachedCid;
          }
        } else {
          console.log("Using cached CID from localStorage");
          cidToUse = cachedCid;
        }
      }

      if (!cidToUse) {
        throw new Error("No stored data found");
      }

      // Parse the CID
      console.log(`Retrieving data with CID: ${cidToUse}`);
      const cid = CID.parse(cidToUse);

      // Retrieve encrypted data from IPFS
      console.log(`Fetching from IPFS with CID: ${cid.toString()}`);
      const encryptedData = await dagInstance.get(cid);
      console.log(
        "Retrieved data structure:",
        JSON.stringify(encryptedData).substring(0, 100) + "...",
      );

      if (!encryptedData || !encryptedData.iv || !encryptedData.encryptedData) {
        console.error("Invalid data format:", encryptedData);
        throw new Error("Invalid encrypted data format");
      }

      // Decrypt the data
      console.log(
        "Attempting decryption with iv length:",
        encryptedData.iv.length,
      );
      console.log("Encrypted data length:", encryptedData.encryptedData.length);
      const decryptedData = await decryptData(encryptedData, decryptionKey);
      console.log("Decryption successful");
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
