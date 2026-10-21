import { describe, expect, it } from 'vitest';
import { fakeKycDefaults, isKycApproved, kycDataSchema } from '@/lib/kyc';

const ACCOUNT = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('simulated KYC', () => {
  it('prefills valid, stable data per account and country', () => {
    const ar = fakeKycDefaults(ACCOUNT, 'AR');
    expect(kycDataSchema.safeParse(ar).success).toBe(true);
    expect(ar).toEqual(fakeKycDefaults(ACCOUNT, 'AR'));
    expect(ar.id_type).toBe('DNI');

    const pe = fakeKycDefaults(ACCOUNT, 'PE');
    expect(kycDataSchema.safeParse(pe).success).toBe(true);
    expect(pe.id_country_code).toBe('PE');
  });

  it('rejects malformed documents and emails', () => {
    const base = fakeKycDefaults(ACCOUNT, 'AR');
    expect(kycDataSchema.safeParse({ ...base, id_number: '12ab' }).success).toBe(false);
    expect(kycDataSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
    expect(kycDataSchema.safeParse({ ...base, id_type: 'PASSPORT' }).success).toBe(false);
  });

  it('is approved only once approved_at is set', () => {
    expect(isKycApproved(null)).toBe(false);
    const profile = { account: ACCOUNT, data: {}, approved_at: null, created_at: new Date(), updated_at: new Date() };
    expect(isKycApproved(profile)).toBe(false);
    expect(isKycApproved({ ...profile, approved_at: new Date() })).toBe(true);
  });
});
