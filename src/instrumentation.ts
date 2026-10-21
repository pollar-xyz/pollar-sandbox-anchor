export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // `next build` loads this file too; jobs need the database and must only run in the server.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startBackgroundJobs } = await import('./lib/jobs');
  startBackgroundJobs();
}
