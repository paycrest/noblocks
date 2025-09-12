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
          key: "X-Frame-Options",
          value: "ALLOWALL",
        },
        {
          key: "Content-Security-Policy",
          value:
            "frame-ancestors 'self' https://warpcast.com https://*.warpcast.com https://*.farcaster.xyz https://farcaster.xyz https://auth.privy.io https://client.warpcast.com;",
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
