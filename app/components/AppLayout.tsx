import React from "react";
import Script from "next/script";
import config from "../lib/config";

import Providers from "../providers";
import MainContent from "../mainContent";
import {
  Footer,
  Navbar,
  LayoutWrapper,
  PWAInstall,
  NoticeBanner,
} from "./index";
import { MaintenanceNoticeModal, MaintenanceBanner } from "./MaintenanceNoticeModal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="min-h-full min-w-full bg-white transition-colors dark:bg-neutral-900">
        <div className="relative">
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
      {/* Brevo Chat Widget */}
      {/^[a-f0-9]{24}$/i.test(config.brevoConversationsId) && config.brevoConversationsGroupId && (
        <>
          <Script id="brevo-chat-config" strategy="afterInteractive">
            {`window.BrevoConversationsID=${JSON.stringify(config.brevoConversationsId)};
            window.BrevoConversations=window.BrevoConversations||function(){
            (window.BrevoConversations.q=window.BrevoConversations.q||[]).push(arguments)};
            window.BrevoConversationsSetup=${
              config.brevoConversationsGroupId 
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
  );
}
