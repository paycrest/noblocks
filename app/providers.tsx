"use client";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { PrivyProvider } from "@privy-io/react-auth";

if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID)
  throw new Error("One or more environment variables are not set");

export default function Providers({ children }: { children: React.ReactNode }) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <PrivyProvider
        appId={privyAppId}
        config={{
          appearance: {
            theme: "dark",
            accentColor: "#8B85F4",
            landingHeader: "Connect",
            logo: "/logos/noblocks-logo.svg",
          },
          embeddedWallets: {
            createOnLogin: "all-users",
          },
          externalWallets: { 
            coinbaseWallet: { 
              connectionOptions: 'smartWalletOnly', 
            }, 
          }, 
        }}
      >
        {children}

        <Toaster position="bottom-right" richColors />
      </PrivyProvider>
    </ThemeProvider>
  );
}
