import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pdf-parse'],
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(self)' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ] }];
  },
};
export default config;
