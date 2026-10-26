import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings';

/**
 * Wide limits and the real anchor's fees, so the tests exercise the transitions and fee math without depending on
 * the small per-operation limits the public sandbox ships with.
 */
export const TEST_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  fees: {
    ARS: {
      deposit: { min: '11', max: '500000', fee_fixed: '10', fee_percent: '1' },
      withdraw: { min: '11', max: '500000', fee_fixed: '10', fee_percent: '2' },
    },
    PEN: {
      deposit: { min: '2', max: '3000', fee_fixed: '1', fee_percent: '1' },
      withdraw: { min: '2', max: '3000', fee_fixed: '1', fee_percent: '2' },
    },
    COP: {
      deposit: { min: '10000', max: '5000000', fee_fixed: '1000', fee_percent: '1' },
      withdraw: { min: '10000', max: '5000000', fee_fixed: '1000', fee_percent: '2' },
    },
  },
  account_limits: { ARS: { daily: '1000000' }, PEN: { daily: '6000' }, COP: { daily: '20000000' } },
};
