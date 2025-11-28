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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="min-h-full min-w-full bg-white transition-colors dark:bg-neutral-900">
        <div className="relative">
          <Navbar />
          {config.noticeBannerText && (
            <NoticeBanner textLines={config.noticeBannerText.split("|")} />
          )}
        </div>
        <LayoutWrapper footer={<Footer />}>
          <MainContent>{children}</MainContent>
        </LayoutWrapper>

        <PWAInstall />
      </div>

      {/* Brevo Chat Widget */}
      {/^[a-f0-9]{24}$/i.test(config.brevoConversationsId) &&
        config.brevoConversationsGroupID &&
        config.brevoConversationsGroupID.trim() !== '' && (
          <>
            <Script
              id="brevo-chat-setup"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                window.BrevoConversationsSetup = {
                  groupId: ${JSON.stringify(config.brevoConversationsGroupID)}
                };
                window.BrevoConversationsID = ${JSON.stringify(config.brevoConversationsId)};
              `,
              }}
            />
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
