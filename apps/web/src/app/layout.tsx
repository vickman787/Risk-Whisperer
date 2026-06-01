import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './global.css';
import { Providers } from './providers';

const LOGO_URL = 'https://raw.createusercontent.com/ef83fbea-b45f-4d4d-8f71-c23d5eb0a565/';
const APP_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_CREATE_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:4000');

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'Risk Whisperer - Mantle RWA AI Agent',
  description:
    'Autonomous RWA risk manager powered by AI. Monitor mETH and USDY in real-time with transparent recommendation logs.',
  icons: {
    icon: LOGO_URL,
    apple: LOGO_URL,
  },
  openGraph: {
    title: 'Risk Whisperer - Mantle RWA AI Agent',
    description:
      'AI x RWA - dynamic yield strategies and automated risk management for USDY and mETH on Mantle.',
    url: APP_URL,
    siteName: 'Risk Whisperer',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Risk Whisperer - AI x RWA on Mantle',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Risk Whisperer - Mantle RWA AI Agent',
    description:
      'AI x RWA - dynamic yield strategies and automated risk management for USDY and mETH on Mantle.',
    images: ['/opengraph-image'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="/fontawesome/releases/v6.3.0/css/pro.min.css?token=2c15cc0cc7"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
