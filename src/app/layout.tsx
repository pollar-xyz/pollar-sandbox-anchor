import type { Metadata } from 'next';
import { SandboxBanner } from '@/components/sandbox-banner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pollar Sandbox Anchor',
  description: 'Stellar testnet anchor (SEP-1, SEP-10, SEP-24) for ARS, PEN and COP ramps. No real money moves.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <SandboxBanner />
        {children}
      </body>
    </html>
  );
}
