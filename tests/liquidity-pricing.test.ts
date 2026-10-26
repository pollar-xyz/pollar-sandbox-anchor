import { Asset, Keypair, Operation } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { toStroops } from '@/lib/amount';
import { assetKey } from '@/lib/liquidity/onchain';
import { type BookCode, offerPrice, planOffers } from '@/lib/liquidity/pricing';

const rates = { ARS: '1450', PEN: '3.7', COP: '4000', XLM: '4', spread_bps: 100 };
const assets: Record<BookCode, Asset> = {
  ARS: new Asset('ARS', Keypair.random().publicKey()),
  PEN: new Asset('PEN', Keypair.random().publicKey()),
  COP: new Asset('COP', Keypair.random().publicKey()),
  XLM: Asset.native(),
  USDC: new Asset('USDC', Keypair.random().publicKey()),
};
const code = (a: Asset) => (Object.keys(assets) as BookCode[]).find((c) => assetKey(assets[c]) === assetKey(a))!;

describe('offerPrice', () => {
  it('quotes mid plus the spread in units of buying per unit of selling', () => {
    expect(Number(offerPrice(rates, 'USDC', 'ARS'))).toBeCloseTo(1450 * 1.01, 6);
    expect(Number(offerPrice(rates, 'ARS', 'USDC'))).toBeCloseTo((1 / 1450) * 1.01, 12);
    expect(Number(offerPrice(rates, 'XLM', 'ARS'))).toBeCloseTo((1450 / 4) * 1.01, 6);
    expect(Number(offerPrice(rates, 'PEN', 'XLM'))).toBeCloseTo((4 / 3.7) * 1.01, 9);
  });

  it('never lets the two directions of a pair cross', () => {
    for (const spread_bps of [0, 1, 100]) {
      const r = { ...rates, spread_bps };
      for (const [a, b] of [
        ['ARS', 'XLM'],
        ['ARS', 'USDC'],
        ['XLM', 'USDC'],
      ] as const) {
        expect(Number(offerPrice(r, a, b)) * Number(offerPrice(r, b, a))).toBeGreaterThan(1);
      }
    }
  });

  it('produces prices the SDK can encode', () => {
    for (const [s, b] of [
      ['ARS', 'USDC'],
      ['USDC', 'ARS'],
      ['XLM', 'PEN'],
    ] as const) {
      expect(() =>
        Operation.manageSellOffer({ selling: assets[s], buying: assets[b], amount: '1', price: offerPrice(rates, s, b) }),
      ).not.toThrow();
    }
  });

  it('rejects broken rates', () => {
    expect(() => offerPrice({ ...rates, ARS: '0' }, 'ARS', 'XLM')).toThrow(/Invalid rate/);
  });
});

describe('planOffers', () => {
  const balances: Record<BookCode, string | null> = {
    ARS: '1000000',
    PEN: '10000',
    COP: null,
    XLM: '10000',
    USDC: '300',
  };

  it('offers both directions of every pair', () => {
    const plans = planOffers({ rates, assets, balances });
    expect(plans).toHaveLength(10);
    const pairs = plans.map((p) => `${code(p.selling)}>${code(p.buying)}`).sort();
    expect(pairs).toEqual(
      [
        'ARS>USDC',
        'ARS>XLM',
        'PEN>USDC',
        'PEN>XLM',
        'USDC>ARS',
        'USDC>PEN',
        'USDC>XLM',
        'XLM>ARS',
        'XLM>PEN',
        'XLM>USDC',
      ].sort(),
    );
  });

  it('sizes from balances and never locks more than 90% of an asset', () => {
    const plans = planOffers({ rates, assets, balances });
    const amount = (s: BookCode, b: BookCode) => plans.find((p) => code(p.selling) === s && code(p.buying) === b)!.amount;
    expect(amount('ARS', 'XLM')).toBe('450000.0000000');
    expect(amount('USDC', 'ARS')).toBe('90.0000000');
    // XLM keeps a 100 XLM fee reserve and splits across three directions.
    expect(amount('XLM', 'USDC')).toBe('2970.0000000');

    for (const c of (Object.keys(balances) as BookCode[]).filter((c) => balances[c] !== null)) {
      const locked = plans.filter((p) => code(p.selling) === c).reduce((acc, p) => acc + toStroops(p.amount), 0n);
      expect(locked).toBeLessThanOrEqual((toStroops(balances[c]!) * 9n) / 10n);
    }
  });

  it('skips pairs without a trustline and empty balances', () => {
    const plans = planOffers({ rates, assets, balances: { ...balances, USDC: null, PEN: '0' } });
    const pairs = plans.map((p) => `${code(p.selling)}>${code(p.buying)}`).sort();
    expect(pairs).toEqual(['ARS>XLM', 'XLM>ARS', 'XLM>PEN']);
  });

  it('quotes COP against XLM and USDC once the wallet holds it', () => {
    const plans = planOffers({ rates, assets, balances: { ...balances, COP: '40000000' } });
    const pairs = plans.map((p) => `${code(p.selling)}>${code(p.buying)}`).filter((p) => p.includes('COP'));
    expect(pairs.sort()).toEqual(['COP>USDC', 'COP>XLM', 'USDC>COP', 'XLM>COP']);
    expect(Number(plans.find((p) => code(p.selling) === 'USDC' && code(p.buying) === 'COP')!.price)).toBeCloseTo(
      4000 * 1.01,
      6,
    );
  });

  it('keeps the XLM reserve out of the book', () => {
    const plans = planOffers({ rates, assets, balances: { ...balances, XLM: '50' } });
    expect(plans.some((p) => p.selling.isNative())).toBe(false);
  });
});
