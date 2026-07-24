"use client";
import React, { useEffect } from "react";
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
import {
  PlayPromoBanner,
  PlayPromoButton,
  PlayPromoModal,
  usePlayPromoBannerVisible,
} from "./PlayPromo";
import SentryClientProvider from "./SentryClientProvider";
import { MoralisStreamRegistration } from "./MoralisStreamRegistration";
import { useEmbed } from "../context/EmbedContext";

/**
 * Brevo support chat. Loaded on every experience — including the embedded
 * /widget, which has dedicated CSS to fit the launcher inside the iframe (see
 * globals.css) — so customers always have a support path. Embed hosts that
 * provide their own support can suppress it with `?hideSupport=1`.
 *
 * Rendered inside <Providers> so it can read the embed config; the scripts are
 * `afterInteractive`, so they never block first paint.
 */
function BrevoChat() {
  const { hideSupport } = useEmbed();

  const enabled =
    !hideSupport &&
    /^[a-f0-9]{24}$/i.test(config.brevoConversationsId) &&
    Boolean(config.brevoConversationsGroupId);

  if (!enabled) return null;

  return (
    <>
      <Script id="brevo-chat-config" strategy="afterInteractive">
        {`window.BrevoConversationsID=${JSON.stringify(config.brevoConversationsId)};
        window.BrevoConversations=window.BrevoConversations||function(){
        (window.BrevoConversations.q=window.BrevoConversations.q||[]).push(arguments)};
        window.BrevoConversationsSetup=${
          config.brevoConversationsGroupId
            ? `{groupId:${JSON.stringify(config.brevoConversationsGroupId)}}`
            : "{}"
        };
        `}
      </Script>
      <Script
        id="brevo-chat-widget"
        src="https://conversations-widget.brevo.com/brevo-conversations.js"
        strategy="afterInteractive"
      />
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Noblocks Play is its own full-screen experience: no global Navbar/Footer
  // (PlayShell renders the game chrome and a CTA back to the main app).
  const isPlayExperience =
    pathname === "/play" ||
    pathname.startsWith("/play/") ||
    pathname === "/play-demo";
  // Embedded widget (/widget, iframed by whitelisted partners): compact
  // chrome-less shell like Play — WidgetShell renders its own card chrome.
  const isWidgetExperience =
    pathname === "/widget" || pathname.startsWith("/widget/");
  const isBareExperience = isPlayExperience || isWidgetExperience;
  const isHomepage = pathname === "/";
  const playPromoBannerVisible = usePlayPromoBannerVisible();
  const showPlayPromo =
    isHomepage && config.fantasyEnabled && !config.fantasyCampaignEnded;
  const showPlayPromoBanner = showPlayPromo && playPromoBannerVisible;

  // The Brevo widget appends its own container directly to <body>, outside
  // this component's tree, so a body-level class (not a wrapper div class)
  // is what CSS needs to scope the /play-only position override to.
  useEffect(() => {
    document.body.classList.toggle("play-experience", isPlayExperience);
    return () => document.body.classList.remove("play-experience");
  }, [isPlayExperience]);

  useEffect(() => {
    document.body.classList.toggle("widget-experience", isWidgetExperience);
    return () => document.body.classList.remove("widget-experience");
  }, [isWidgetExperience]);

  return (
    <SentryClientProvider>
      <Providers>
        <MoralisStreamRegistration />
        {isBareExperience ? (
          <div
            className={`min-h-dvh min-w-full transition-colors ${
              isWidgetExperience
                ? // Transparent backdrop: the embedding page shows through the
                  // iframe around the floating WidgetShell card (per Figma).
                  "bg-transparent"
                : "bg-white dark:bg-neutral-900"
            }`}
          >
            {children}
          </div>
        ) : (
          <div className="min-h-full min-w-full bg-white transition-colors dark:bg-neutral-900">
            <div
              className={`relative ${showPlayPromoBanner
                ? "mb-16 md:mb-[64px]"
                : config.maintenanceEnabled
                  ? "mb-16"
                  : ""
                }`}
            >
              <Navbar />
              {showPlayPromoBanner ? (
                <PlayPromoBanner />
              ) : config.maintenanceEnabled ? (
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

            {showPlayPromo && <PlayPromoButton />}
            <PWAInstall />
            <MaintenanceNoticeModal />
            {showPlayPromo && <PlayPromoModal />}
          </div>
        )}
        <BrevoChat />
      </Providers>
    </SentryClientProvider>
  );
}
