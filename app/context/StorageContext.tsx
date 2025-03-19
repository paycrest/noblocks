import { createHelia } from "helia";
import { dagJson } from "@helia/dag-json";
import { useState, useEffect, createContext, useContext } from "react";
import { CID } from "multiformats/cid";

/**
 * Type definition for the Storage Context
 */
type StorageContextType = {
  save: (data: any) => Promise<string>;
  retrieve: (cid: string) => Promise<any>;
  isInitialized: boolean;
} | null;

const StorageContext = createContext<StorageContextType>(null);

/**
 * StorageProvider component - Stage 2: Structured Data with DAG
 * Allows storing complex data structures (objects, arrays) using Helia
 */
export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [helia, setHelia] = useState<any>(null);
  const [dagInstance, setDagInstance] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Helia on component mount
  useEffect(() => {
    const init = async () => {
      try {
        const heliaNode = await createHelia();
        const dagApi = dagJson(heliaNode);

        setHelia(heliaNode);
        setDagInstance(dagApi);
        setIsInitialized(true); // helia initialized
      } catch (error) {
        console.error("Failed to initialize Helia:", error);
      }
    };

    init();
  }, []);

  /**
   * Save structured data using Helia
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
   * Retrieve structured data from Helia by CID
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
