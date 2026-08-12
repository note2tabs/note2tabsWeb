/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "note2tabs.com" }],
        destination: "https://www.note2tabs.com/:path*",
        permanent: true,
      },
      {
        source: "/transcriber",
        destination: "/transcribe",
        permanent: true,
      },
      {
        source: "/online-guitar-tab-editor",
        destination: "/editor",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/gte/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
      },
      {
        source: "/embed/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), autoplay=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; frame-ancestors *",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
        ],
      },
      {
        source: "/:path((?!embed(?:/|$)).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
  images: {
    qualities: [68, 72, 75],
  },
  outputFileTracingIncludes: {
    "/api/chord-fingerings": ["./data/chord-fingerings-index.json"],
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
