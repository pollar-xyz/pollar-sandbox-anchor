import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin/session';
import { safeNextPath } from '@/lib/admin/tokens';

export const metadata: Metadata = { title: 'Admin - Pollar Sandbox Anchor', robots: { index: false } };

const ERRORS: Record<string, string> = {
  not_allowed: 'Esa cuenta de Google no tiene acceso al admin.',
  email_unverified: 'El email de esa cuenta de Google no está verificado.',
  state_mismatch: 'La sesión de login expiró o no es válida. Probá de nuevo.',
  access_denied: 'Cancelaste el login con Google.',
  oauth_failed: 'No se pudo completar el login con Google. Probá de nuevo.',
  config: 'El login no está configurado en este servidor.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = await searchParams;
  const error = typeof params.error === 'string' ? params.error : undefined;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : undefined);

  const session = await getAdminSession().catch(() => null);
  if (session) redirect(next);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-24">
      <div>
        <h1 className="text-2xl font-semibold">Admin del Sandbox Anchor</h1>
        <p className="text-muted mt-1 text-sm">Acceso restringido al equipo de Pollar.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {ERRORS[error] ?? 'No se pudo iniciar sesión.'}
        </p>
      )}
      {params.logged_out && !error && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Cerraste sesión.
        </p>
      )}
      <a
        href={`/api/admin/auth/login?next=${encodeURIComponent(next)}`}
        className="bg-brand hover:bg-brand-dark rounded-md px-4 py-2.5 text-center text-sm font-medium text-white"
      >
        Entrar con Google
      </a>
    </main>
  );
}
