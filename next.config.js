/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Feature branches must be reviewable without exposing unfinished plans on
  // the production deployment. Vercel replaces this at build time.
  env: {
    NEXT_PUBLIC_PRO_PLAN_PREVIEW:
      process.env.VERCEL_ENV === "production" ? "false" : "true",
  },
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
  // Prisma 6 uses its native Node-API query engine in our Node.js functions.
  // Its package also ships browser/edge WASM engines for every supported
  // database; Next's conservative tracer otherwise stores all of them in each
  // function bundle even though this app only uses PostgreSQL through the
  // native library engine.
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/@prisma/client/runtime/query_engine_bg.*",
      "./node_modules/@prisma/client/runtime/query_compiler_bg.*",
      "./node_modules/.prisma/client/query_engine_bg.wasm",
    ],
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
