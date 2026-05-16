import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Allow dev HMR / _next assets when the app is opened via ngrok (or similar)
  // instead of localhost only. See https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok.app",
  ],
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
          value: "DENY",
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
  ],
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["@headlessui/react", "framer-motion", "hugeicons-react", "react-icons"],
    // Workaround for Turbopack scope-hoisting BytePos overflow panic
    // ("The high bits of the position ... are not all 0s or 1s") that
    // crashes `next build --turbopack` on large module graphs (e.g. Sanity).
    // Fix landed in Next.js 16 via vercel/next.js#83399 and is not in 15.5.x.
    // Remove this once we upgrade to a Next.js version that includes the fix.
    turbopackScopeHoisting: false,
  },
  // Twilio: keep on Node resolution (nested https-proxy-agent vs root dep caused
  // "can't be external" version skew when https-proxy-agent was listed here).
  serverExternalPackages: ["mixpanel", "twilio"],
  webpack: (config, { isServer }) => {
    // Handle both client and server-side fallbacks
    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      fs: false,
      crypto: false,
      stream: false,
      util: false,
      url: false,
      assert: false,
      http: false,
      https: false,
      zlib: false,
      path: false,
      os: false,
    };

    // Handle Mixpanel on server-side only
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'mixpanel': 'commonjs mixpanel'
      });
    }

    return config;
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
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js"
      }
    }
  },
};

export default nextConfig;
