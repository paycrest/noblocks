// "use client";
// import { useState, useEffect } from "react";
// import { usePrivy } from "@privy-io/react-auth";
// import WalletMigrationBanner from "./WalletMigrationBanner";

// export function WalletMigrationGate() {
//     const { authenticated, ready, user } = usePrivy();
//     const [showBanner, setShowBanner] = useState(false);

//     useEffect(() => {
//         // Check if user needs migration
//         // For now, show banner if user is authenticated and has a smart wallet
//         // TODO: Enhance this to check if old SCW has funds
//         if (authenticated && ready && user) {
//             const smartWallet = user.linkedAccounts.find(
//                 (account) => account.type === "smart_wallet",
//             );

//             // Show banner if user has a smart wallet (legacy SCW)
//             // In the future, we'll check if migration is needed based on:
//             // 1. If old SCW has funds
//             // 2. If migration hasn't been completed
//             if (smartWallet) {
//                 setShowBanner(true);
//             } else {
//                 setShowBanner(false);
//             }
//         } else {
//             setShowBanner(false);
//         }
//     }, [authenticated, ready, user]);

//     const handleStartMigration = () => {
//         // TODO: Open migration modal
//         console.log("Migration started");
//     };

//     if (!showBanner) {
//         return null;
//     }

//     return <WalletMigrationBanner onStartMigration={handleStartMigration} />;
// }

