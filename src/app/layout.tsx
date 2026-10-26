import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SandboxBanner } from '@/components/sandbox-banner';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pollar Sandbox Anchor',
  description: 'Stellar testnet anchor (SEP-1, SEP-10, SEP-24) for ARS, PEN and COP ramps. No real money moves.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}>
        <SandboxBanner />
        {children}
      </body>
    </html>
  );
}
