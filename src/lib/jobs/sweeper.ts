import { getSettings } from '../settings';
import { depositsAwaitingTransfer, expireStale, markDepositReceived, TransitionError } from '../sep24/transitions';

const INTERVAL_MS = 30_000;

/** One pass: expire stale transactions, then auto-receive deposits if settings.auto_receive_seconds > 0. */
export async function sweepOnce(): Promise<{ expired: number; received: number }> {
  const expired = await expireStale();
  let received = 0;
  const { auto_receive_seconds: seconds } = await getSettings();
  if (seconds > 0) {
    for (const id of await depositsAwaitingTransfer(seconds)) {
      try {
        await markDepositReceived(id, 'system');
        received++;
      } catch (err) {
        // Another replica or the user's own click got there first.
        if (!(err instanceof TransitionError)) throw err;
      }
    }
  }
  return { expired, received };
}

/**
 * Safe to run on every replica: each step is conditional on the current status, so a transaction is
 * expired or received exactly once.
 */
export function startSweeper(): void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sweepOnce()
      .then(({ expired, received }) => {
        if (expired || received) console.info(`[sweeper] expired ${expired}, auto-received ${received}`);
      })
      .catch((err) => console.error('[sweeper] pass failed', err))
      .finally(() => (running = false));
  }, INTERVAL_MS);
  timer.unref();
}
