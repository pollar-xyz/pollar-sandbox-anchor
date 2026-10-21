import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

describe('secret encryption', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips', () => {
    const secret = 'SBXXXXEXAMPLESECRET';
    expect(decryptSecret(encryptSecret(secret, key), key)).toBe(secret);
  });

  it('fails with another key', () => {
    const payload = encryptSecret('x', key);
    expect(() => decryptSecret(payload, randomBytes(32).toString('base64'))).toThrow();
  });
});
