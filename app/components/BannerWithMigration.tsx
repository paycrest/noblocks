"use client";
import React, { useState, useEffect } from "react";
import NoticeBanner from "./NoticeBanner";
import MigrationModal from "./migration/MigrationModal";
import config from "@/app/lib/config";
import { useMigrationStatus } from "@/app/hooks/useMigrationStatus";
import { getBannerContent } from "@/app/utils";

const BannerWithMigration: React.FC = () => {
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const { userStatus, isCheckingMigration, checkPrivyUser } =
    useMigrationStatus();

  useEffect(() => {
    checkPrivyUser();
  }, [checkPrivyUser]);

  // CTA click handler
  const handleCtaClick = () => {
    if (config.migrationMode && userStatus.isLegacyUser) {
      setMigrationModalOpen(true);
    } else if (userStatus.isLegacyUser) {
      window.open("https://old.noblocks.xyz", "_blank");
    } else if (config.noticeBannerCtaUrl) {
      window.open(config.noticeBannerCtaUrl, "_blank");
    }
  };

  const bannerContent = getBannerContent(userStatus, isCheckingMigration);

  if (!bannerContent) return null;

  return (
    <>
      <NoticeBanner
        textLines={bannerContent.text.split("|")}
        ctaText={bannerContent.ctaText}
        onCtaClick={bannerContent.ctaText ? handleCtaClick : undefined}
        bannerId={userStatus.isLegacyUser ? "legacy-user" : "new-user"}
      />
      {config.migrationMode && (
        <MigrationModal
          isOpen={migrationModalOpen}
          onClose={() => setMigrationModalOpen(false)}
        />
      )}
    </>
  );
};

export default BannerWithMigration;
