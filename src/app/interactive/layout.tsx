import type { Metadata } from 'next';
import { AnchorShell } from '@/components/anchor/shell';

export const metadata: Metadata = {
  title: 'Pollar Sandbox',
  robots: { index: false, follow: false },
};

export default function InteractiveLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AnchorShell>{children}</AnchorShell>;
}
