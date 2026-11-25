/** @type {import('next').NextConfig} */
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    // Only fingerprinted assets are safe to retain across users of a device.
    // Never store pages, RSC payloads, API data or authentication responses.
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.origin === self.location.origin &&
          url.pathname.startsWith("/_next/static/"),
        handler: "CacheFirst",
        options: { cacheName: "aerolearn-static-v2", expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 } },
      },
    ],
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
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      { source: "/app/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
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
