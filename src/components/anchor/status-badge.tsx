import type { StatusTone } from '@/app/interactive/_lib/format';

const TONES: Record<StatusTone, string> = {
  pending: 'bg-amber-400 text-white',
  success: 'bg-emerald-500 text-white',
  failure: 'bg-red-500 text-white',
};

export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold ${TONES[tone]}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4}>
        {tone === 'pending' ? (
          <>
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2 2M10 2h4" strokeLinecap="round" />
          </>
        ) : tone === 'success' ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M7 7l10 10M17 7L7 17" strokeLinecap="round" />
        )}
      </svg>
      {label}
    </span>
  );
}
