import { createHelia } from "helia";
import { dagJson } from "@helia/dag-json";
import { ipns } from "@helia/ipns";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { useState, useEffect, createContext, useContext } from "react";
import { CID } from "multiformats/cid";
import { toast } from "sonner";

/**
 * Type definition for the Storage Context
 */
type StorageContextType = {
  save: (data: any) => Promise<string>;
  retrieve: (cid: string) => Promise<any>;
  publishToIpns: (cid: string, key?: string) => Promise<string>;
  resolveFromIpns: (keyName: string) => Promise<string>;
  isInitialized: boolean;
} | null;

const StorageContext = createContext<StorageContextType>(null);

/**
 * StorageProvider component - With IPNS support
 * Allows storing complex data structures with persistent naming
 */
export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [helia, setHelia] = useState<any>(null);
  const [dagInstance, setDagInstance] = useState<any>(null);
  const [ipnsInstance, setIpnsInstance] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  // Store IPNS keys with their names
  const [ipnsKeys, setIpnsKeys] = useState<Record<string, any>>({});

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
   * Save structured data to IPFS via Helia
   * This creates an immutable, content-addressed record
   * @param data - Data object to store (can be complex nested objects/arrays)
   * @returns CID string of stored data
   */
  const save = async (data: any): Promise<string> => {
    if (!isInitialized || !dagInstance) {
      throw new Error("Storage not initialized");
    }

    try {
      // Store the structured data using Helia DAG
      const cid = await dagInstance.add(data);
      return cid.toString();
    } catch (error) {
      console.error("Error saving data:", error);
      throw error;
    }
  };

  /**
   * Retrieve immutable structured data from IPFS via Helia
   * @param cidString - Content ID to retrieve
   * @returns Retrieved data structure
   */
  const retrieve = async (cidString: string): Promise<any> => {
    if (!isInitialized || !dagInstance) {
      throw new Error("Storage not initialized");
    }

    try {
      // Parse the CID string to a CID object
      const cid = CID.parse(cidString);

      // Retrieve structured data using the CID object
      const retrievedData = await dagInstance.get(cid);

      if (retrievedData === undefined || retrievedData === null) {
        throw new Error("Failed to retrieve data");
      }

      return retrievedData;
    } catch (error) {
      console.error("Error retrieving data:", error);
      if (error instanceof Error && error.message.includes("multihash")) {
        console.error(
          "CID parsing error. Make sure the CID format is correct.",
        );
      }
      throw error;
    }
  };

  /**
   * Publish content to IPNS to create a persistent, updatable name
   * @param cidString - CID of content to publish
   * @param keyName - Optional name for the key (defaults to 'default')
   * @returns Key name that can be used to resolve the content
   */
  const publishToIpns = async (
    cidString: string,
    keyName = "default",
  ): Promise<string> => {
    if (!isInitialized || !ipnsInstance) {
      throw new Error("IPNS not initialized");
    }

    try {
      // Get or generate a key for this name
      let privateKey = ipnsKeys[keyName];

      if (!privateKey) {
        // Generate a new key if none exists
        privateKey = await generateKeyPair("Ed25519");
        setIpnsKeys((prev) => ({ ...prev, [keyName]: privateKey }));
        console.log(`Generated new IPNS key: ${keyName}`);
      }

      // Parse the CID
      const cid = CID.parse(cidString);

      // Publish the content to IPNS - using the private key
      await ipnsInstance.publish(privateKey, cid);

      toast.success("Content published to IPNS");

      // Return the key name for future resolution
      return keyName;
    } catch (error) {
      console.error("Error publishing to IPNS:", error);
      throw error instanceof Error
        ? new Error(`Failed to publish to IPNS: ${error.message}`)
        : new Error(`Failed to publish to IPNS`);
    }
  };

  /**
   * Resolve an IPNS name to the latest content CID
   * @param keyName - Name of the key used to publish
   * @returns The latest CID for this name
   */
  const resolveFromIpns = async (keyName: string): Promise<string> => {
    if (!isInitialized || !ipnsInstance) {
      throw new Error("IPNS not initialized");
    }

    try {
      // Get the private key for this name
      const privateKey = ipnsKeys[keyName];

      if (!privateKey) {
        throw new Error(`No key found for ${keyName}`);
      }

      // Resolve using the public key - correct property access
      const result = await ipnsInstance.resolve(privateKey.publicKey);
      console.log("IPNS resolve result:", result);

      // Return the CID as a string
      return result.cid.toString();
    } catch (error) {
      console.error("Error resolving IPNS name:", error);
      throw error instanceof Error
        ? new Error(`Failed to resolve IPNS name: ${error.message}`)
        : new Error(`Failed to resolve IPNS name`);
    }
  };

  return (
    <StorageContext.Provider
      value={{
        save,
        retrieve,
        publishToIpns,
        resolveFromIpns,
        isInitialized,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Hook to access the storage context
 */
export const useStorage = (): StorageContextType => useContext(StorageContext);
