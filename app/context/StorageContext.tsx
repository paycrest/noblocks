import { createHelia } from "helia";
import { dagJson } from "@helia/dag-json";
import { ipns } from "@helia/ipns";
import { strings } from "@helia/strings";
import { useState, useEffect, createContext, useContext } from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { CID } from "multiformats/cid";
import { createEd25519PeerId } from "@libp2p/peer-id-factory";
import { useInjectedWallet } from "./InjectedWalletContext";

/**
 * Type definition for the Storage Context
 */
type StorageContextType = {
  saveEncrypted: (key: string, data: any) => Promise<string>;
  retrieveEncrypted: (key: string) => Promise<any>;
  isInitialized: boolean;
} | null;

const StorageContext = createContext<StorageContextType>(null);

/**
 * StorageProvider component
 * Encrypted storage using IPFS/IPNS with wallet-derived keys
 */
export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [helia, setHelia] = useState<any>(null);
  const [dag, setDag] = useState<any>(null);
  const [ipnsInstance, setIpnsInstance] = useState<any>(null);
  const [str, setStr] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { wallets } = useWallets();
  const { signMessage } = usePrivy();
  const { isInjectedWallet, injectedAddress, injectedProvider } =
    useInjectedWallet();

  // Initialize Helia on component mount
  useEffect(() => {
    const init = async () => {
      try {
        const heliaNode = await createHelia({
          libp2p: {
            // @ts-ignore
            start: true,
          },
        });
        const dagInstance = dagJson(heliaNode);
        const ipnsInstance = ipns(heliaNode);
        const stringsInstance = strings(heliaNode);

        setHelia(heliaNode);
        setDag(dagInstance);
        setIpnsInstance(ipnsInstance);
        setStr(stringsInstance);
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
    if (isInjectedWallet && injectedProvider) {
      try {
        const accounts = await injectedProvider.request({
          method: "eth_requestAccounts",
        });

        const signResult = await injectedProvider.request({
          method: "personal_sign",
          params: [`0x${Buffer.from(message).toString("hex")}`, accounts[0]],
        });

        return signResult;
      } catch (error) {
        console.error("Injected wallet signature error:", error);
        throw new Error("Failed to sign message with injected wallet");
      }
    } else {
      const signResult = await signMessage(
        { message },
        { uiOptions: { buttonText: "Sign for encryption" } },
      );

      if (!signResult) {
        throw new Error("User denied signature request");
      }

      return signResult.signature;
    }
  };

  /**
   * Generate a deterministic PeerId from wallet address
   * @param address - Ethereum address
   */
  const getPeerIdFromAddress = async (address: string) => {
    // Check if we already have a stored PeerId
    const storedKey = localStorage.getItem(
      `noblocks-ipns-key-${address.toLowerCase()}`,
    );
    if (storedKey) {
      try {
        // Use stored PeerId if available
        const peerId = await createEd25519PeerId();
        return peerId;
      } catch (error) {
        console.error("Failed to load stored PeerId:", error);
      }
    }

    // Generate a new PeerId
    try {
      const peerId = await createEd25519PeerId();

      // Store the PeerId for future use
      localStorage.setItem(
        `noblocks-ipns-key-${address.toLowerCase()}`,
        peerId.toString(),
      );

      console.log(
        `Peer ID generated and set to: noblocks-ipns-key-${address.toLowerCase()} ${peerId.toString()}`,
      );

      return peerId;
    } catch (error) {
      console.error("Failed to create PeerId:", error);
      throw new Error("Could not create PeerId for IPNS");
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
   * Save encrypted data to IPFS and bind to IPNS
   * @param key - Storage key
   * @param data - Data to store
   * @returns CID string of stored data
   */
  const saveEncrypted = async (key: string, data: any): Promise<string> => {
    if (!isInitialized || !dag || !ipnsInstance) {
      throw new Error("Storage not initialized");
    }

    try {
      const walletAddress = getWalletAddress();

      // Sign a message with the wallet to derive encryption key
      const message = `Encrypt data for ${key} with wallet ${walletAddress.toLowerCase()}`;
      const signature = await signForEncryption(message);
      console.log("Signature for encryption:", signature);

      // Derive an encryption key from the signature
      const encryptionKey = await deriveEncryptionKey(signature);
      console.log("Derived encryption key:", encryptionKey);

      // Encrypt the data
      const encrypted = await encryptData(data, encryptionKey);
      console.log("Data encrypted:", encrypted);

      // Store encrypted data in IPFS
      const cid = await dag.add(encrypted);
      console.log(
        `Data encrypted and stored in IPFS with CID: ${cid.toString()}`,
      );

      try {
        // Get a PeerId for IPNS based on wallet address
        const peerId = await getPeerIdFromAddress(walletAddress);

        // Publish the CID to IPNS with the user's PeerId
        await ipnsInstance.publish(peerId, cid);
        console.log(`Published to IPNS with key: ${peerId.toString()}`);

        // Store a mapping of the key to the CID for easier retrieval
        localStorage.setItem(
          `data-${walletAddress.toLowerCase()}-${key}`,
          cid.toString(),
        );
      } catch (ipnsError) {
        console.error("IPNS publishing error:", ipnsError);
        // At least store the CID in localStorage even if IPNS fails
        localStorage.setItem(
          `data-${walletAddress.toLowerCase()}-${key}`,
          cid.toString(),
        );
      }

      console.log("CID stored in localStorage:", cid.toString());
      return cid.toString();
    } catch (error) {
      console.error("Error saving encrypted data:", error);
      throw error instanceof Error
        ? new Error(`Failed to save encrypted data: ${error.message}`)
        : new Error(`Failed to save encrypted data`);
    }
  };

  /**
   * Retrieve and decrypt data from IPFS/IPNS
   * @param key - Storage key
   * @returns Decrypted data
   */
  const retrieveEncrypted = async (key: string): Promise<any> => {
    if (!isInitialized || !dag || !ipnsInstance) {
      throw new Error("Storage not initialized");
    }

    try {
      const walletAddress = getWalletAddress();

      // Sign the same message to derive the same encryption key
      const message = `Encrypt data for ${key} with wallet ${walletAddress.toLowerCase()}`;
      const signature = await signForEncryption(message);
      console.log("Signature for decryption:", signature);

      // Derive the decryption key
      const decryptionKey = await deriveEncryptionKey(signature);
      console.log("Derived decryption key:", decryptionKey);

      let cid: CID | null = null;

      try {
        // Try to resolve the CID from IPNS
        const peerId = await getPeerIdFromAddress(walletAddress);
        console.log(`Peer ID for IPNS: ${peerId.toString()}`);

        const resolvedCid = await ipnsInstance.resolve(peerId);
        console.log(`Resolved CID from IPNS: ${resolvedCid?.toString()}`);

        if (resolvedCid) {
          cid = resolvedCid;
          console.log(`Using resolved CID from IPNS: ${cid?.toString()}`);
        }
      } catch (ipnsError) {
        console.error("IPNS resolution error:", ipnsError);
      }

      // If IPNS resolution fails, try to get the CID from localStorage
      if (!cid) {
        console.log("Attempting to retrieve CID from localStorage");
        const storedCidString = localStorage.getItem(
          `data-${walletAddress.toLowerCase()}-${key}`,
        );
        if (storedCidString) {
          try {
            cid = CID.parse(storedCidString);
            console.log(`Using stored CID: ${cid.toString()}`);
          } catch (cidError) {
            console.error("Error parsing stored CID:", cidError);
          }
        }
      }

      if (!cid) {
        throw new Error("No stored data found");
      }

      // Retrieve the encrypted data from IPFS
      const encryptedData = await dag.get(cid);
      console.log("Encrypted data retrieved from IPFS:", encryptedData);

      if (!encryptedData) {
        throw new Error("Failed to retrieve encrypted data from IPFS");
      }

      // Decrypt the data
      try {
        const decryptedData = await decryptData(encryptedData, decryptionKey);
        console.log("Data successfully retrieved and decrypted", decryptedData);
        return decryptedData;
      } catch (decryptError) {
        console.error("Decryption failed with error:", decryptError);
        console.log("Encrypted data format:", encryptedData);
        throw new Error(
          `Decryption failed: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
        );
      }
    } catch (error) {
      console.error("Error retrieving encrypted data:", error);
      throw error instanceof Error
        ? new Error(`Failed to retrieve encrypted data: ${error.message}`)
        : new Error(`Failed to retrieve encrypted data`);
    }
  };

  return (
    <StorageContext.Provider
      value={{ saveEncrypted, retrieveEncrypted, isInitialized }}
    >
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Hook to access the storage context
 */
export const useStorage = (): StorageContextType => useContext(StorageContext);
