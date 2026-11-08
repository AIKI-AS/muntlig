import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['pdf-parse'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Content-Security-Policy', value: process.env.NODE_ENV === 'development'
        ? "frame-ancestors 'self' https://design.agent-native.com"
        : "frame-ancestors 'none'" },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(self)' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ] }];
  },
};
export default config;
