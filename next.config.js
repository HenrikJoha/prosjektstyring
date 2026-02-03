/** @type {import('next').NextConfig} */
const nextConfig = {
  // Avoid "Converting circular structure to JSON" from ESLint config during build (ESLint 9 + legacy config).
  // Run `npm run lint` locally or in CI to lint.
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
