/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/transcriber",
        has: [{ type: "host", value: "note2tabs.com" }],
        destination: "https://www.note2tabs.com/transcribe",
        permanent: true,
      },
      {
        source: "/online-guitar-tab-editor",
        has: [{ type: "host", value: "note2tabs.com" }],
        destination: "https://www.note2tabs.com/editor",
        permanent: true,
      },
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
        source: "/(.*)",
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
