import "./globals.css";
import React from "react";
import "react-toastify/dist/ReactToastify.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import Providers from "./providers";
import MainContent from "./mainContent";
import { Footer, Navbar } from "./components";
import { ToastContainer } from "react-toastify";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Noblocks",
  description: "Crypto-to-fiat payments with no blocks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-full min-w-full bg-white transition-colors dark:bg-neutral-900">
            <Navbar />
            <div className="relative z-10 mx-auto flex min-h-screen flex-col items-center px-4 pt-20 transition-all">
              <MainContent>{children}</MainContent>
              <Footer />
            </div>
          </div>
          <ToastContainer
            position="bottom-right"
            theme="dark"
            stacked
            pauseOnHover
            pauseOnFocusLoss
            draggable
            bodyClassName="font-sans"
          />
        </Providers>
      </body>
    </html>
  );
}
