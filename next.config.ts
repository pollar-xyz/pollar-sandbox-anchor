import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@stellar/stellar-sdk', 'pg'],
  async headers() {
    // SEP-1 requires the TOML to be readable cross-origin; SEP-10/24 clients are browser wallets too.
    const cors = [
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' },
      { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
    ];
    return [
      { source: '/.well-known/stellar.toml', headers: cors },
      { source: '/auth', headers: cors },
      { source: '/transfer24/:path*', headers: cors },
    ];
  },
};

export default nextConfig;
