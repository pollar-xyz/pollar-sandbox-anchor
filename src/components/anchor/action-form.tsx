'use client';

import { useActionState, type ReactNode } from 'react';
import { primaryButton } from './styles';

export type ActionState = { error?: string } | null;

export function ActionForm({
  action,
  submitLabel,
  pendingLabel = 'Procesando...',
  buttonClassName = primaryButton,
  children,
  footer,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  buttonClassName?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {children}
      <button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? pendingLabel : submitLabel}
      </button>
      {state?.error ? (
        <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {footer}
    </form>
  );
}
