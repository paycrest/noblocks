/** @type {import('next').NextConfig} */
const nextConfig = {
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-DNS-Prefetch-Control",
          value: "on",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },

        {
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; base-uri 'self'; " +
            // Allow embedding in Warpcast plus known wrapper hosts (e.g., warpcast-wallet.vercel.app)
            "frame-ancestors 'self' https://warpcast.com https://*.warpcast.com https://*.farcaster.xyz https://*.vercel.app; " +
            "img-src 'self' data: https:; " +
            "connect-src 'self' https: wss:; " +
            "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "font-src 'self' data:; " +
            "frame-src https://warpcast.com https://*.warpcast.com https://*.farcaster.xyz https://*.vercel.app",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
      ],
    },
    {
      source: "/sw.js",
      headers: [
        {
          key: "Content-Type",
          value: "application/javascript; charset=utf-8",
        },
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
        {
          key: "Content-Security-Policy",
          value: "default-src 'self'; script-src 'self'",
        },
      ],
    },
    {
      source: "/.well-known/farcaster.json",
      headers: [
        { key: "Content-Type", value: "application/json" },
        { key: "Cache-Control", value: "public, max-age=3600" },
      ],
    },
  ],
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["@headlessui/react", "framer-motion"],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flagcdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        // Sanity image assets are served under /images/...
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      ...(process.env.NODE_ENV !== "production"
        ? [
            {
              protocol: "https",
              hostname: "picsum.photos",
              pathname: "/**",
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
