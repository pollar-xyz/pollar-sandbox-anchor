'use server';

import { type ActionResult, runAdminAction } from '@/lib/admin/action-result';
import { isSettingKey, parseSettingForm } from '@/lib/admin/settings-form';
import { isFiatCode } from '@/lib/assets';
import { AccountRole } from '@prisma/client';
import { listActiveAccounts } from '@/lib/accounts';
import {
  bootstrap,
  claimSozuUsdc,
  createLiquidityWallet,
  mintToLiquidity,
  publishOffers,
  rebootstrap,
  retireLiquidityWallet,
} from '@/lib/liquidity';
import { setSetting } from '@/lib/settings';
import { expireStale, forceStatus, markDepositReceived } from '@/lib/sep24/transitions';
import { SEP24_STATUSES } from './statuses';

const AMOUNT = /^\d+(\.\d{1,7})?$/;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function bootstrapAction(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  return runAdminAction(async (admin) => {
    const accounts = await bootstrap(`admin:${admin.email}`);
    return accounts.length ? `Bootstrap listo: ${accounts.length} cuenta(s) creada(s).` : 'Bootstrap listo: no faltaba nada.';
  });
}

export async function rebootstrapAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async (admin) => {
    if (text(formData, 'confirm') !== 'RESET') return { ok: false, message: 'Escribí RESET para confirmar.' };
    const accounts = await rebootstrap(`admin:${admin.email}`);
    return `Re-bootstrap listo: nueva generación con ${accounts.length} cuenta(s).`;
  });
}

export async function createLiquidityWalletAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async (admin) => {
    const existing = await listActiveAccounts(AccountRole.LIQUIDITY);
    if (existing.length > 0 && text(formData, 'confirmExtra') !== 'on') {
      return { ok: false, message: 'Ya hay una wallet de liquidez. Marcá la casilla si igual querés otra.' };
    }
    const account = await createLiquidityWallet(`admin:${admin.email}`, text(formData, 'label') || undefined);
    return `Wallet creada: ${account.public_key}`;
  });
}

export async function mintAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async () => {
    const accountId = text(formData, 'accountId');
    const asset = text(formData, 'asset');
    const amount = text(formData, 'amount');
    if (!accountId) return { ok: false, message: 'Elegí una wallet.' };
    if (!isFiatCode(asset)) return { ok: false, message: 'Asset inválido.' };
    if (!AMOUNT.test(amount) || Number(amount) <= 0) return { ok: false, message: 'Monto inválido.' };
    const txHash = await mintToLiquidity(accountId, asset, amount);
    return `Emitidos ${amount} ${asset}. Tx: ${txHash}`;
  });
}

export async function sozuClaimAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async () => {
    const result = await claimSozuUsdc(text(formData, 'accountId'));
    if (result.ok) return `Recibidos ${result.amount} USDC${result.txHash ? `. Tx: ${result.txHash}` : ''}`;
    const next = result.nextAvailableAt ? ` Próximo intento: ${result.nextAvailableAt.toISOString()}` : '';
    return { ok: false, message: `Sozu rechazó el claim: ${result.reason}.${next}` };
  });
}

export async function retireLiquidityWalletAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async (admin) => {
    const fromId = text(formData, 'accountId');
    const toId = text(formData, 'targetId');
    if (!fromId || !toId) return { ok: false, message: 'Elegí la wallet de destino.' };
    if (text(formData, 'confirm') !== 'RETIRAR') return { ok: false, message: 'Escribí RETIRAR para confirmar.' };
    const { txHash } = await retireLiquidityWallet(fromId, toId, `admin:${admin.email}`);
    return txHash ? `Wallet retirada y fondos movidos. Tx: ${txHash}` : 'La wallet no existía on-chain: quedó retirada.';
  });
}

export async function publishOffersAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async () => {
    const offers = await publishOffers(text(formData, 'accountId') || undefined);
    return `Ofertas publicadas: ${offers.length}.`;
  });
}

export async function markDepositReceivedAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async (admin) => {
    const tx = await markDepositReceived(text(formData, 'id'), `admin:${admin.email}`);
    return `Depósito marcado como recibido. Estado: ${tx.status}.`;
  });
}

export async function forceStatusAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async (admin) => {
    const status = text(formData, 'status');
    const note = text(formData, 'note');
    if (!(SEP24_STATUSES as readonly string[]).includes(status)) return { ok: false, message: 'Estado inválido.' };
    if (!note) return { ok: false, message: 'La nota es obligatoria.' };
    const tx = await forceStatus(text(formData, 'id'), status, `admin:${admin.email}`, note);
    return `Estado forzado a ${tx.status}.`;
  });
}

export async function expireStaleAction(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  return runAdminAction(async () => {
    const count = await expireStale();
    return `Transacciones expiradas: ${count}.`;
  });
}

export async function saveSettingAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAdminAction(async (admin) => {
    const key = text(formData, 'key');
    if (!isSettingKey(key)) return { ok: false, message: 'Configuración desconocida.' };
    const parsed = parseSettingForm(key, (name) => {
      const value = formData.get(name);
      return typeof value === 'string' ? value : null;
    });
    if (!parsed.ok) {
      const values = Object.fromEntries([...formData.entries()].filter((e): e is [string, string] => typeof e[1] === 'string'));
      return { ok: false, message: 'Revisá los campos marcados.', fieldErrors: parsed.errors, values };
    }
    await setSetting(key, parsed.value, admin.email);
    return 'Guardado.';
  });
}
