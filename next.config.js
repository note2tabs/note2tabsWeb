/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Feature branches must be reviewable without exposing unfinished plans on
  // the production deployment. Vercel replaces this at build time.
  env: {
    NEXT_PUBLIC_ES_AVAILABLE: process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_ES_REVIEWED === "true" ? "true" : "false",
    NEXT_PUBLIC_PT_BR_PREVIEW: process.env.VERCEL_ENV === "preview" ? "true" : "false",
    NEXT_PUBLIC_PT_BR_AVAILABLE: process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_PT_BR_REVIEWED === "true" ? "true" : "false",
    NEXT_PUBLIC_PRO_PLAN_PREVIEW:
      process.env.VERCEL_ENV === "production" ? "false" : "true",
  },
  async redirects() {
    return [
      {source: "/es/online-guitar-tab-editor", destination: "/es/editor", permanent: true},
      {source: "/es/transcriber", destination: "/es/transcribe", permanent: true},
      {source: "/pt-br/online-guitar-tab-editor", destination: "/pt-br/editor", permanent: true},
      {source: "/pt-br/transcriber", destination: "/pt-br/transcribe", permanent: true},
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
      {
        source: "/blog/the-best-ai-guitar-tab-generator-online-turn-any-song-instantly",
        destination: "/blog/the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly",
        permanent: true,
      },
      {
        source: "/youtube-to-guitar-tabs-converter",
        destination: "/youtube-to-guitar-tabs",
        permanent: true,
      },
      {
        source: "/youtube-to-tabs-converter",
        destination: "/youtube-to-guitar-tabs",
        permanent: true,
      },
      {
        source: "/youtube-to-guitar-tab",
        destination: "/youtube-to-guitar-tabs",
        permanent: true,
      },
      {
        source: "/youtube-guitar-tabs",
        destination: "/youtube-to-guitar-tabs",
        permanent: true,
      },
      {
        source: "/convert/youtube-to-guitar-tab",
        destination: "/youtube-to-guitar-tabs",
        permanent: true,
      },
      {
        source: "/mp3-to-guitar-tab-converter",
        destination: "/mp3-to-guitar-tabs",
        permanent: true,
      },
      {
        source: "/mp3-to-guitar-tab",
        destination: "/mp3-to-guitar-tabs",
        permanent: true,
      },
      {
        source: "/mp3-to-note2tabs",
        destination: "/mp3-to-guitar-tabs",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // These version-stable brand assets were being revalidated on most
        // visits. Browser caching avoids repeat edge requests; Vercel's CDN
        // continues to serve the first request normally.
        source: "/:asset(logo-mark-96|android-chrome-192x192|android-chrome-512x512|apple-touch-icon|favicon-16x16|favicon-32x32).png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/site.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/note2tabs-social-preview.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }],
      },
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
  // Prisma uses the Neon driver adapter and the JavaScript query compiler.
  // Cached installs can retain obsolete native/legacy engines, and Next's
  // conservative tracer would otherwise copy those files into every function.
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/.prisma/client/libquery_engine-*",
      "./node_modules/.prisma/client/query_engine_bg.wasm",
      "./node_modules/.prisma/client/query_engine_bg.js",
      "./node_modules/@prisma/client/runtime/binary.*",
      "./node_modules/@prisma/client/runtime/library.*",
      "./node_modules/@prisma/client/runtime/query_engine_bg.*",
      "./node_modules/@prisma/client/runtime/query_compiler_bg.*",
    ],
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
