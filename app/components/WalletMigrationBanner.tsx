// "use client";
// import Image from "next/image";
// import React, { useState } from "react";
// import { motion } from "framer-motion";
// import WalletMigrationModal from "./WalletMigrationModal";

// interface WalletMigrationBannerProps {
//     //     the start Migration Button
//     // will popup this modal
// }

// const WalletMigrationBanner: React.FC<WalletMigrationBannerProps> = ({ }) => {
//     const [isModalOpen, setIsModalOpen] = useState(false);

//     const handleStartMigration = () => {
//         setIsModalOpen(true);
//     };

//     const handleCloseModal = () => {
//         setIsModalOpen(false);
//     };

//     const handleApproveMigration = () => {
//         // TODO: Implement migration approval logic
//         console.log("Migration approved");
//         setIsModalOpen(false);
//     };

//     return (
//         <motion.div
//             className="fixed left-0 right-0 top-16 z-30 mt-1 flex h-16 w-full items-center justify-center bg-[#2D77E2] px-0 md:px-0"
//             initial={{ opacity: 0, y: -20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.5, ease: "easeOut" }}
//         >
//             {/* Illustration and Text Container - Extreme Left */}
//             <div className="absolute left-0 z-10 flex items-center gap-3 py-4 sm:py-4">
//                 {/* Desktop Illustration */}
//                 <div className="hidden flex-shrink-0 sm:block">
//                     <Image
//                         src="/images/desktop-eip-migration.png"
//                         alt="Migration Illustration"
//                         width={120}
//                         height={80}
//                         priority
//                         className="h-auto w-auto"
//                     />
//                 </div>

//                 {/* Mobile Illustration */}
//                 <div className="flex-shrink-0 sm:hidden">
//                     <Image
//                         src="/images/mobile-eip-migration.png"
//                         alt="Migration Illustration Mobile"
//                         width={60}
//                         height={80}
//                         priority
//                         className="h-auto w-auto"
//                     />
//                 </div>

//                 {/* Text Content */}
//                 <div className="flex flex-col items-start justify-center gap-1 text-left text-sm font-medium leading-tight text-white/80">
//                     <span className="block">
//                         Noblocks is migrating, this is a legacy version that will be
//                         closed by{" "}
//                         <span className="font-semibold text-white">
//                             6th June, 2025
//                         </span>
//                         . Click on start migration to move to the new version.
//                     </span>
//                 </div>
//             </div>

//             {/* Content Container with max-width constraint - Original button position */}
//             <div className="relative z-10 mx-auto flex w-full max-w-screen-2xl items-center justify-end px-4 py-4 sm:px-8 sm:py-4">
//                 {/* Start Migration Button */}
//                 <div className="flex-shrink-0">
//                     <button
//                         onClick={handleStartMigration}
//                         className="whitespace-nowrap rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-neutral-900 transition-all hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#2D77E2] active:bg-white/80"
//                     >
//                         Start migration
//                     </button>
//                 </div>
//             </div>

//             {/* Migration Modal */}
//             <WalletMigrationModal
//                 isOpen={isModalOpen}
//                 onClose={handleCloseModal}
//                 onApprove={handleApproveMigration}
//             />
//         </motion.div>
//     );
// };

// export default WalletMigrationBanner;



"use client";
import Image from "next/image";
import React, { useState } from "react";
import { motion } from "framer-motion";
import WalletMigrationModal from "./WalletMigrationModal";

interface WalletMigrationBannerProps {
    //     the start Migration Button
    // will popup this modal
}

const WalletMigrationBanner: React.FC<WalletMigrationBannerProps> = ({ }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleStartMigration = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleApproveMigration = () => {
        // TODO: Implement migration approval logic
        console.log("Migration approved");
        setIsModalOpen(false);
    };

    return (
        <>
            {/* Desktop Banner - Original Design Preserved */}
            <motion.div
                className="fixed left-0 right-0 top-16 z-30 mt-1 hidden h-16 w-full items-center justify-center bg-[#2D77E2] px-0 sm:flex md:px-0"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                {/* Illustration and Text Container - Extreme Left */}
                <div className="absolute left-0 z-10 flex items-center gap-3 py-4">
                    {/* Desktop Illustration */}
                    <div className="flex-shrink-0">
                        <Image
                            src="/images/desktop-eip-migration.png"
                            alt="Migration Illustration"
                            width={120}
                            height={80}
                            priority
                            className="h-auto w-auto"
                        />
                    </div>

                    {/* Text Content */}
                    <div className="flex flex-col items-start justify-center gap-1 text-left text-sm font-medium leading-tight text-white/80">
                        <span className="block">
                            Noblocks is migrating, this is a legacy version that will be
                            closed by{" "}
                            <span className="font-semibold text-white">
                                6th June, 2025
                            </span>
                            . Click on start migration to move to the new version.
                        </span>
                    </div>
                </div>

                {/* Content Container with max-width constraint - Original button position */}
                <div className="relative z-10 mx-auto flex w-full max-w-screen-2xl items-center justify-end px-4 py-4 sm:px-8 sm:py-4">
                    {/* Start Migration Button */}
                    <div className="flex-shrink-0">
                        <button
                            onClick={handleStartMigration}
                            className="whitespace-nowrap rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-neutral-900 transition-all hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#2D77E2] active:bg-white/80"
                        >
                            Start migration
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* Mobile Banner */}
            <motion.div
                className="fixed left-0 right-0 top-16 z-30 mt-1 flex w-full flex-col bg-[#2D77E2] px-4 py-6 sm:hidden"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                {/* Mobile Illustration - Top Left */}
                <div className="absolute left-0 top-0 z-0 h-full">
                    <Image
                        src="/images/mobile-eip-migration.png"
                        alt="Migration Illustration Mobile"
                        width={80}
                        height={100}
                        priority
                        className="h-40 w-auto object-contain"
                    />
                </div>

                {/* Content with left padding for illustration */}
                <div className="relative z-10 mb-6 pl-4 pr-10">
                    <p className="text-sm font-medium leading-relaxed text-white">
                        Noblocks is migrating, this is a legacy version that will be
                        closed by{" "}
                        <span className="font-bold text-white">6th June, 2025</span>.
                        Click on start migration to move to the new version.
                    </p>
                </div>

                {/* Start Migration Button - Below Text */}
                <div className="relative z-10 pl-4">
                    <button
                        onClick={handleStartMigration}
                        className="rounded-xl bg-white px-8 py-3 text-base font-semibold text-neutral-900 transition-all hover:bg-white/90 active:bg-white/80"
                    >
                        Start migration
                    </button>
                </div>
            </motion.div>

            {/* Migration Modal */}
            <WalletMigrationModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onApprove={handleApproveMigration}
            />
        </>
    );
};

export default WalletMigrationBanner;