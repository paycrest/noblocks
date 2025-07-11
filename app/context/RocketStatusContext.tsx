import React, { createContext, useContext, useState, ReactNode } from "react";

export type RocketStatus = "pending" | "processing" | "fulfilled" | "settled";

interface RocketStatusContextType {
  rocketStatus: RocketStatus;
  setRocketStatus: (status: RocketStatus) => void;
}

const RocketStatusContext = createContext<RocketStatusContextType | undefined>(
  undefined,
);

export const RocketStatusProvider = ({ children }: { children: ReactNode }) => {
  const [rocketStatus, setRocketStatus] = useState<RocketStatus>("pending");
  return (
    <RocketStatusContext.Provider value={{ rocketStatus, setRocketStatus }}>
      {children}
    </RocketStatusContext.Provider>
  );
};

export const useRocketStatus = () => {
  const context = useContext(RocketStatusContext);
  if (!context)
    throw new Error(
      "useRocketStatus must be used within a RocketStatusProvider",
    );
  return context;
};
