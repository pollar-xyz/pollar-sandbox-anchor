import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin/session';
import { Wordmark } from '@/components/anchor/shell';
import { AdminNav } from '../_components/nav';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin - Pollar Sandbox Anchor', robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto flex min-h-[calc(100vh-2.25rem)] max-w-7xl flex-col md:flex-row">
      <aside className="bg-surface flex shrink-0 flex-col gap-4 border-b border-gray-200 p-4 md:w-56 md:border-r md:border-b-0">
        <div className="bg-night rounded-xl px-3 py-3">
          <Wordmark />
          <p className="mt-2 text-xs text-white/55">Admin</p>
        </div>
        <AdminNav />
        <div className="mt-auto flex items-center justify-between gap-2 md:flex-col md:items-start">
          <p className="text-muted truncate text-xs" title={admin.email}>
            {admin.email}
          </p>
          <form action="/api/admin/auth/logout" method="post">
            <button type="submit" className="text-muted hover:text-ink text-xs underline">
              Salir
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
