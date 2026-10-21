import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: z.url().refine((u) => u.startsWith('https://') || u.startsWith('http://localhost'), 'PUBLIC_URL must be https'),
  SECRETS_ENCRYPTION_KEY: z.string().refine((k) => Buffer.from(k, 'base64').length === 32, 'must be 32 bytes, base64'),
  SEP10_JWT_SECRET: z.string().min(32),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  ADMIN_EMAILS: z.string().min(1),
  HORIZON_URL: z.url(),
  FRIENDBOT_URL: z.url(),
  SOZU_FAUCET_URL: z.url(),
  USDC_ISSUER: z.string().length(56),
  WATCHER_ENABLED: z.enum(['true', 'false']),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Read lazily so `next build` can evaluate routes without runtime secrets.
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export function adminEmails(): string[] {
  return env()
    .ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
