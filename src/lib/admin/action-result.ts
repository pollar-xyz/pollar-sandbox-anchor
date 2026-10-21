import { revalidatePath } from 'next/cache';
import { AdminAuthError, requireAdminAction, type AdminSession } from './session';

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values, so a form can show them again after React resets it. */
  values?: Record<string, string>;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'Error desconocido';
}

/**
 * Wraps a server action body: checks the admin session first, turns thrown errors into an
 * ActionResult the form can show, and refreshes the admin pages after a write.
 */
export async function runAdminAction(body: (admin: AdminSession) => Promise<string | ActionResult>): Promise<ActionResult> {
  let admin: AdminSession;
  try {
    admin = await requireAdminAction();
  } catch (err) {
    if (err instanceof AdminAuthError) return { ok: false, message: 'Tu sesión expiró. Volvé a entrar.' };
    return { ok: false, message: errorMessage(err) };
  }
  try {
    const result = await body(admin);
    revalidatePath('/admin', 'layout');
    return typeof result === 'string' ? { ok: true, message: result } : result;
  } catch (err) {
    console.error('[admin] action failed:', errorMessage(err));
    return { ok: false, message: errorMessage(err) };
  }
}

/** Runs a read for a server component and keeps the page rendering when it fails. */
export async function safeRead<T>(read: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await read() };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
