import type { KycProfile } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';

// Field names follow the real anchor's SEP-12 fixtures (id_type, id_country_code, id_number).
export const kycDataSchema = z.object({
  first_name: z.string().trim().min(1, 'Ingresá el nombre').max(80),
  last_name: z.string().trim().min(1, 'Ingresá el apellido').max(80),
  email: z.email('Email inválido'),
  id_type: z.enum(['DNI', 'CE']),
  id_country_code: z.enum(['AR', 'PE']),
  id_number: z
    .string()
    .trim()
    .regex(/^\d{6,12}$/, 'El número de documento debe tener entre 6 y 12 dígitos'),
});

export type KycData = z.infer<typeof kycDataSchema>;

/** Fictitious but stable defaults, derived from the account so the same wallet always sees the same person. */
export function fakeKycDefaults(account: string, country: 'AR' | 'PE'): KycData {
  let hash = 0;
  for (const ch of account) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const idNumber = String(20_000_000 + (hash % 30_000_000));
  return {
    first_name: 'Juana',
    last_name: 'Pérez',
    email: `sandbox+${account.slice(0, 8).toLowerCase()}@example.com`,
    id_type: country === 'AR' ? 'DNI' : 'CE',
    id_country_code: country,
    id_number: country === 'AR' ? idNumber : idNumber.slice(0, 9),
  };
}

export function isKycApproved(profile: KycProfile | null): boolean {
  return Boolean(profile?.approved_at);
}

export async function getKyc(account: string): Promise<KycProfile | null> {
  return db().kycProfile.findUnique({ where: { account } });
}

export async function saveKyc(account: string, data: KycData): Promise<KycProfile> {
  const parsed = kycDataSchema.parse(data);
  return db().kycProfile.upsert({
    where: { account },
    create: { account, data: parsed },
    update: { data: parsed },
  });
}

export async function approveKyc(account: string): Promise<KycProfile> {
  return db().kycProfile.update({ where: { account }, data: { approved_at: new Date() } });
}
