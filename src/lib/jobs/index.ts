import { env } from '../env';
import { startSweeper } from './sweeper';
import { runWithdrawWatcher } from './watcher';

const globalForJobs = globalThis as unknown as { sandboxJobsStarted?: boolean };

/** Starts the background jobs once per process. */
export function startBackgroundJobs(): void {
  if (globalForJobs.sandboxJobsStarted) return;
  globalForJobs.sandboxJobsStarted = true;

  let config;
  try {
    config = env();
  } catch (err) {
    console.error('[jobs] invalid environment, background jobs not started', err);
    return;
  }
  startSweeper();
  if (config.WATCHER_ENABLED === 'true') {
    void runWithdrawWatcher();
  } else {
    console.info('[jobs] WATCHER_ENABLED is false, withdraw watcher not started');
  }
}
