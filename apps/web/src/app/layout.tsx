import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './global.css';
import { Providers } from './providers';

const LOGO_URL = 'https://raw.createusercontent.com/ef83fbea-b45f-4d4d-8f71-c23d5eb0a565/';

export const metadata: Metadata = {
  title: 'Risk Whisperer — Mantle RWA AI Agent',
  description:
    'Autonomous RWA risk manager powered by AI. Every decision recorded on Mantle. Monitor mETH and USDY in real-time with transparent on-chain reasoning.',
  icons: {
    icon: LOGO_URL,
    apple: LOGO_URL,
  },
  openGraph: {
    title: 'Risk Whisperer — Mantle RWA AI Agent',
    description:
      'Autonomous RWA risk manager. Every decision recorded on Mantle. Monitor mETH and USDY in real-time.',
    images: [
      {
        url: LOGO_URL,
        width: 1200,
        height: 630,
        alt: 'Risk Whisperer Logo',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Risk Whisperer — Mantle RWA AI Agent',
    description:
      'Autonomous RWA risk manager. Every decision recorded on Mantle. Monitor mETH and USDY in real-time.',
    images: [LOGO_URL],
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
