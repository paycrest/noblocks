import './globals.css';
import 'react-toastify/dist/ReactToastify.css';

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Noblocks • Waitlist',
  description:
    'The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.',
  publisher: 'Paycrest',
  authors: [{ name: 'Paycrest', url: 'https://paycrest.io' }],
  metadataBase: new URL('https://noblocks.xyz'),
  openGraph: {
    title: 'Noblocks',
    description:
      'The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.',
    url: 'https://noblocks.xyz',
    siteName: 'Noblocks',
    images: [
      {
        url: '/images/og-image.gif',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  icons: {
    icon: '/favicon.ico',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Noblocks',
    description:
      'The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.',
    creator: '@noblocks_xyz',
    images: ['/images/og-image.gif'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
