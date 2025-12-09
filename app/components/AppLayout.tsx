"use client";
import React, { useEffect, useState } from "react";
import Script from "next/script";
import config from "../lib/config";

import MainContent from "../mainContent";
import {
  Footer,
  Navbar,
  LayoutWrapper,
  PWAInstall,
  NoticeBanner,
} from "./index";
import { useBaseApp } from "../context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isBaseApp, isFarcaster } = useBaseApp();
  const [isMounted, setIsMounted] = useState(false);

  // Only check mini app status after mount to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Always render full UI on server, then conditionally hide on client after mount
  const isMiniApp = isMounted && (isBaseApp || isFarcaster);

  return (
    <>
      <div className="min-h-full min-w-full bg-white transition-colors dark:bg-neutral-900">
        {!isMiniApp && (
          <div className="relative">
            <Navbar />
            {config.noticeBannerText && (
              <NoticeBanner textLines={config.noticeBannerText.split("|")} />
            )}
          </div>
        )}
        <LayoutWrapper footer={!isMiniApp ? <Footer /> : undefined}>
          <MainContent>{children}</MainContent>
        </LayoutWrapper>

        {!isMiniApp && <PWAInstall />}
      </div>

      {/* Brevo Chat Widget */}
      {/^[a-f0-9]{24}$/i.test(config.brevoConversationsId) && (
        <>
          {" "}
          <Script id="brevo-chat-config" strategy="afterInteractive">
            {" "}
            {`window.BrevoConversationsID=${JSON.stringify(config.brevoConversationsId)};window.BrevoConversations=window.BrevoConversations||function(){(window.BrevoConversations.q=window.BrevoConversations.q||[]).push(arguments)};`}{" "}
          </Script>{" "}
          <Script
            id="brevo-chat-widget"
            src="https://conversations-widget.brevo.com/brevo-conversations.js"
            strategy="afterInteractive"
          />{" "}
        </>
      )}
    </>
  );
}
