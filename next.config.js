/** @type {import('next').NextConfig} */
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

/**
 * Maintenance mode gates the product, not the website.
 *
 * The previous rule was `/((?!maintenance).*)` — every path, which meant that
 * turning MAINTENANCE_MODE on also took down the marketing home page and the
 * legal documents. Google's OAuth brand review hit exactly that: it reported
 * the home page as inaccessible and /legal/privacy as having "insufficient
 * content", because both were serving the maintenance stub.
 *
 * Those pages have to stay reachable whether or not the app is up — OAuth
 * verification, the Play/Store listings and the cookie banner all link to
 * them. So the gate now names the signed-in surface explicitly.
 */
const MAINTENANCE_GATED = ["/app", "/app/:path*", "/admin", "/admin/:path*"];

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  async redirects() {
    if (process.env.MAINTENANCE_MODE !== "1") return [];

    return MAINTENANCE_GATED.map((source) => ({
      source,
      destination: "/maintenance",
      permanent: false,
    }));
  },
}

module.exports = withPWA(nextConfig)