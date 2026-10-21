import { Horizon, Networks } from '@stellar/stellar-sdk';
import { env } from './env';

export const NETWORK_PASSPHRASE = Networks.TESTNET;

let server: Horizon.Server | undefined;

export function horizon(): Horizon.Server {
  if (!server) server = new Horizon.Server(env().HORIZON_URL);
  return server;
}

export function publicUrl(path = ''): string {
  return `${env().PUBLIC_URL.replace(/\/$/, '')}${path}`;
}

/** SEP-10 home domain and web_auth_domain: the host the TOML is served from. */
export function homeDomain(): string {
  return new URL(env().PUBLIC_URL).host;
}
