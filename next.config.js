/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizeCss: true,
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
