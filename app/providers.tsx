"use client";
import mixpanel from "mixpanel-browser";
import { ThemeProvider } from "next-themes";
import { ToastContainer } from "react-toastify";

export default function Providers({ children }: { children: React.ReactNode }) {
  const mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

  mixpanel.init(mixpanelToken, {
    debug: true,
    track_pageview: true,
    persistence: "localStorage",
  });

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}

      <ToastContainer
        position="bottom-left"
        theme="dark"
        stacked
        draggable
        pauseOnHover
        pauseOnFocusLoss
        bodyClassName="font-sans"
      />
    </ThemeProvider>
  );
}
