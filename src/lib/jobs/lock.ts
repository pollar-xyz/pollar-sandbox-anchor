import { Client } from 'pg';
import { env } from '../env';

// Advisory locks belong to the Postgres session that took them. Prisma's pool hands connections in
// and out and closes idle ones, which would silently drop the lock, so the lock lives on its own client.

export interface HeldLock {
  /** Resolves when the connection holding the lock is lost: the lock is gone with it. */
  lost: Promise<void>;
  release(): Promise<void>;
}

export async function tryAdvisoryLock(key: number): Promise<HeldLock | null> {
  const client = new Client({ connectionString: env().DATABASE_URL });
  let markLost: () => void = () => {};
  const lost = new Promise<void>((resolve) => (markLost = resolve));
  client.on('error', () => markLost());
  client.on('end', () => markLost());
  await client.connect();
  try {
    const res = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [key]);
    if (!res.rows[0]?.locked) {
      await client.end();
      return null;
    }
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
  // Keeps the session alive through proxies that drop idle connections.
  const keepAlive = setInterval(() => {
    client.query('SELECT 1').catch(() => markLost());
  }, 60_000);
  keepAlive.unref();
  void lost.then(() => clearInterval(keepAlive));
  return {
    lost,
    release: async () => {
      clearInterval(keepAlive);
      await client.end().catch(() => {});
    },
  };
}
