import { type Asset, type Keypair, Memo, Operation, TransactionBuilder, type xdr } from '@stellar/stellar-sdk';
import { horizon, NETWORK_PASSPHRASE } from './stellar';

const BASE_FEE = '1000';

/** Builds, signs and submits a transaction from `source`. Returns the hash. */
export async function submitOperations(
  source: Keypair,
  operations: xdr.Operation[],
  opts: { memo?: Memo; extraSigners?: Keypair[] } = {},
): Promise<string> {
  const account = await horizon().loadAccount(source.publicKey());
  const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }).setTimeout(60);
  for (const op of operations) builder.addOperation(op);
  if (opts.memo) builder.addMemo(opts.memo);
  const tx = builder.build();
  tx.sign(source, ...(opts.extraSigners ?? []));
  const res = await horizon().submitTransaction(tx);
  return res.hash;
}

export async function sendPayment(input: {
  from: Keypair;
  to: string;
  asset: Asset;
  amount: string;
  memo?: Memo;
}): Promise<string> {
  return submitOperations(
    input.from,
    [Operation.payment({ destination: input.to, asset: input.asset, amount: input.amount })],
    {
      memo: input.memo,
    },
  );
}

export { Memo };
