"use client";
import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePrivy } from "@privy-io/react-auth";

interface MigrationStatusContextProps {
  isMigrationComplete: boolean;
  isLoading: boolean;
  refetch: () => void;
}

const MigrationStatusContext = createContext<
  MigrationStatusContextProps | undefined
>(undefined);

const MIGRATION_STATUS_REFETCH_EVENT = "refetch-migration-status";

export const MigrationStatusProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, getAccessToken } = usePrivy();
  const [isMigrationComplete, setIsMigrationComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    const handler = () => setRefetchTrigger((t) => t + 1);
    window.addEventListener(MIGRATION_STATUS_REFETCH_EVENT, handler);
    return () =>
      window.removeEventListener(MIGRATION_STATUS_REFETCH_EVENT, handler);
  }, []);

  useEffect(() => {
    async function checkMigration() {
      if (!user?.id) {
        setIsMigrationComplete(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.warn(
            "No access token available for migration status check",
          );
          setIsMigrationComplete(false);
          return;
        }

        const response = await fetch(
          `/api/v1/wallets/migration-status?userId=${user.id}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setIsMigrationComplete(data.migrationCompleted ?? false);
        } else {
          console.error(
            "Migration status API error:",
            response.status,
            response.statusText,
          );
          setIsMigrationComplete(false);
        }
      } catch (error) {
        console.error("Error checking migration status:", error);
        setIsMigrationComplete(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkMigration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refetchTrigger]);

  const refetch = useCallback(() => {
    setRefetchTrigger((t) => t + 1);
  }, []);

  return (
    <MigrationStatusContext.Provider
      value={{ isMigrationComplete, isLoading, refetch }}
    >
      {children}
    </MigrationStatusContext.Provider>
  );
};

export function useMigrationStatus() {
  const context = useContext(MigrationStatusContext);
  if (!context) {
    throw new Error(
      "useMigrationStatus must be used within a MigrationStatusProvider",
    );
  }
  return context;
}

export function triggerMigrationStatusRefetch(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MIGRATION_STATUS_REFETCH_EVENT));
  }
}
