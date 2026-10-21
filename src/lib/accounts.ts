import { type AccountRole, type AnchorAccount } from '@prisma/client';
import { Keypair } from '@stellar/stellar-sdk';
import { decryptSecret, encryptSecret } from './crypto';
import { db } from './db';
import { env } from './env';

export async function listActiveAccounts(role?: AccountRole): Promise<AnchorAccount[]> {
  return db().anchorAccount.findMany({
    where: { active: true, ...(role ? { role } : {}) },
    orderBy: { created_at: 'asc' },
  });
}

export async function getActiveAccount(role: AccountRole): Promise<AnchorAccount | null> {
  return db().anchorAccount.findFirst({ where: { role, active: true }, orderBy: { created_at: 'asc' } });
}

export async function requireActiveAccount(role: AccountRole): Promise<AnchorAccount> {
  const account = await getActiveAccount(role);
  if (!account) throw new Error(`Anchor account ${role} is not bootstrapped`);
  return account;
}

export function keypairOf(account: AnchorAccount): Keypair {
  return Keypair.fromSecret(decryptSecret(account.secret_enc, env().SECRETS_ENCRYPTION_KEY));
}

export async function activeKeypair(role: AccountRole): Promise<Keypair> {
  return keypairOf(await requireActiveAccount(role));
}

export async function currentGeneration(): Promise<number> {
  const latest = await db().anchorAccount.findFirst({ where: { active: true }, orderBy: { generation: 'desc' } });
  return latest?.generation ?? 0;
}

/** Persists a new keypair. Funding it on-chain is the caller's job. */
export async function storeAccount(input: {
  role: AccountRole;
  keypair: Keypair;
  generation: number;
  label?: string;
}): Promise<AnchorAccount> {
  return db().anchorAccount.create({
    data: {
      role: input.role,
      public_key: input.keypair.publicKey(),
      secret_enc: encryptSecret(input.keypair.secret(), env().SECRETS_ENCRYPTION_KEY),
      generation: input.generation,
      label: input.label,
    },
  });
}
