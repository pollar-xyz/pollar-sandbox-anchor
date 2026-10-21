'use client';

import { useActionState, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/admin/action-result';
import { buttonClass } from './ui';

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  submitLabel,
  pendingLabel = 'Procesando...',
  confirmMessage,
  variant = 'primary',
  className = '',
  children,
}: {
  action: Action;
  submitLabel: string;
  pendingLabel?: string;
  confirmMessage?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
      className={`flex flex-col gap-2 ${className}`}
    >
      {children}
      <div>
        <button type="submit" disabled={pending} className={buttonClass(variant)}>
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function ActionMessage({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={`rounded-md px-3 py-2 text-sm break-words ${state.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
    >
      {state.message}
    </p>
  );
}
