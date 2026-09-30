import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // En production, le script de déploiement alterne entre .next-a et .next-b (bascule sans coupure).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // N'embarque que les icônes / modules réellement utilisés (sinon ~12 000 modules par page).
  experimental: { optimizePackageImports: ['@phosphor-icons/react', 'recharts', 'd3', 'motion'] },
};

export default nextConfig;
