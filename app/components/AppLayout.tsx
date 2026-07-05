"use client";
import React from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import config from "../lib/config";

import Providers from "../providers";
import MainContent from "../mainContent";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { LayoutWrapper } from "./LayoutWrapper";
import PWAInstall from "./PWAInstallManager";
import NoticeBanner from "./NoticeBanner";
import { MaintenanceNoticeModal, MaintenanceBanner } from "./MaintenanceNoticeModal";
import SentryClientProvider from "./SentryClientProvider";
import { MoralisStreamRegistration } from "./MoralisStreamRegistration";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Noblocks Play is its own full-screen experience: no global Navbar/Footer
  // (PlayShell renders the game chrome and a CTA back to the main app).
  const isPlayExperience =
    pathname === "/play" ||
    pathname.startsWith("/play/") ||
    pathname === "/play-demo";

  return (
    <SentryClientProvider>
      <Providers>
        <MoralisStreamRegistration />
        {isPlayExperience ? (
          <div className="min-h-dvh min-w-full bg-white transition-colors dark:bg-neutral-900">
            {children}
          </div>
        ) : (
        <div className="min-h-full min-w-full bg-white transition-colors dark:bg-neutral-900">
          <div className={`relative ${config.maintenanceEnabled ? 'mb-16' : ''}`}>
            <Navbar />
            {config.maintenanceEnabled ? (
              <MaintenanceBanner />
            ) : (
              config.noticeBannerText && (
                <NoticeBanner textLines={config.noticeBannerText.split("|")} />
              )
            )}
          </div>
          <LayoutWrapper footer={<Footer />}>
            <MainContent>{children}</MainContent>
          </LayoutWrapper>

          <PWAInstall />
          <MaintenanceNoticeModal />
        </div>
        )}
        {/* Brevo Chat Widget */}
        {/^[a-f0-9]{24}$/i.test(config.brevoConversationsId) && config.brevoConversationsGroupId && (
          <>
            <Script id="brevo-chat-config" strategy="afterInteractive">
              {`window.BrevoConversationsID=${JSON.stringify(config.brevoConversationsId)};
            window.BrevoConversations=window.BrevoConversations||function(){
            (window.BrevoConversations.q=window.BrevoConversations.q||[]).push(arguments)};
            window.BrevoConversationsSetup=${config.brevoConversationsGroupId
                ? `{groupId:${JSON.stringify(config.brevoConversationsGroupId)}}`
                : '{}'
              };
            `}
            </Script>
            <Script
              id="brevo-chat-widget"
              src="https://conversations-widget.brevo.com/brevo-conversations.js"
              strategy="afterInteractive"
            />
          </>
        )}
      </Providers>
    </SentryClientProvider>
  );
}
