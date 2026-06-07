/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@shelter-accord/core'],
  // Не валимо production-збірку на помилках типів/лінту — їх можна
  // перевіряти окремо через `npm run type-check` / `npm run lint`.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
