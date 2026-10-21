'use server';

import { redirect } from 'next/navigation';
import { isFiatCode } from '@/lib/assets';
import { db } from '@/lib/db';
import { approveKyc, getKyc, isKycApproved, kycDataSchema, saveKyc } from '@/lib/kyc';
import { markDepositReceived, submitDepositAmount, submitWithdrawDetails } from '@/lib/sep24/transitions';
import { normalizeAmountInput } from '../_lib/amount-input';
import { cleanBankAccount, validateBankAccount } from '../_lib/format';
import { readSession } from '../_lib/session';
import type { ActionState } from '@/components/anchor/action-form';

const EXPIRED: ActionState = { error: 'La sesión expiró. Volvé a abrir el enlace desde tu wallet.' };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `No pudimos procesar la operación: ${message}`;
}

async function requireSession(id: string) {
  const claims = await readSession(id);
  if (!claims) return null;
  const tx = await db().transaction.findUnique({ where: { id } });
  if (!tx || tx.account !== claims.account) return null;
  return { claims, tx };
}

async function requireApprovedSession(id: string) {
  const session = await requireSession(id);
  if (!session) return null;
  return isKycApproved(await getKyc(session.claims.account)) ? session : null;
}

export async function approveKycAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession(id);
  if (!session) return EXPIRED;
  const parsed = kycDataSchema.safeParse({
    first_name: field(formData, 'first_name'),
    last_name: field(formData, 'last_name'),
    email: field(formData, 'email'),
    id_type: field(formData, 'id_type'),
    id_country_code: field(formData, 'id_country_code'),
    id_number: field(formData, 'id_number'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisá los datos ingresados.' };
  try {
    await saveKyc(session.claims.account, parsed.data);
    await approveKyc(session.claims.account);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  redirect(`/interactive/${id}`);
}

export async function confirmDepositAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireApprovedSession(id);
  if (!session) return EXPIRED;
  if (session.tx.kind !== 'deposit') return { error: 'Esta transacción no es un depósito.' };
  const amount = normalizeAmountInput(field(formData, 'amount'));
  if (!amount) return { error: 'Monto inválido.' };
  try {
    await submitDepositAmount(id, amount);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  redirect(`/interactive/${id}`);
}

export async function simulateReceivedAction(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const session = await requireSession(id);
  if (!session) return EXPIRED;
  if (session.tx.kind !== 'deposit') return { error: 'Solo los depósitos esperan una transferencia bancaria.' };
  try {
    await markDepositReceived(id, 'user');
  } catch (err) {
    return { error: errorMessage(err) };
  }
  redirect(`/interactive/${id}`);
}

export async function confirmWithdrawAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireApprovedSession(id);
  if (!session) return EXPIRED;
  if (session.tx.kind !== 'withdrawal') return { error: 'Esta transacción no es un retiro.' };
  const asset = session.tx.asset_code;
  if (!isFiatCode(asset)) return { error: `Asset no soportado: ${asset}` };
  const amount = normalizeAmountInput(field(formData, 'amount'));
  if (!amount) return { error: 'Monto inválido.' };
  const holder = field(formData, 'holder');
  if (!holder) return { error: 'Ingresá el titular de la cuenta.' };
  const bankAccount = cleanBankAccount(field(formData, 'bank_account'));
  const accountError = validateBankAccount(asset, bankAccount);
  if (accountError) return { error: accountError };
  const bankName = field(formData, 'bank_name') || undefined;
  try {
    await submitWithdrawDetails(id, { amount, destination: { holder, bankAccount, bankName } });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  redirect(`/interactive/${id}`);
}
