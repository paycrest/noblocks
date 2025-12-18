import { withSentryConfig } from "@sentry/nextjs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

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
    optimizePackageImports: ["@headlessui/react", "framer-motion"],
  },
  serverExternalPackages: ["mixpanel", "https-proxy-agent", "rate-limiter-flexible"],
  webpack: (config, { isServer }) => {
    const webpack = require("webpack");

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

    // Exclude TypeScript definition files from being processed
    if (!config.plugins) {
      config.plugins = [];
    }
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\.d\.ts$/,
      })
    );

    // Handle Mixpanel on server-side only
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        mixpanel: "commonjs mixpanel",
      });
    } else {
      // CLIENT-SIDE: Exclude problematic packages
      config.resolve.alias = {
        ...config.resolve.alias,
        '@solana-program/token': false,
        '@solana-program/system': false,
      };
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
        as: "*.js",
      },
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: "Paycrest",

  project: "noblocks",

  sentryUrl: process.env.SENTRY_URL,

  authToken: process.env.SENTRY_AUTH_TOKEN,

  release: "2.0.0",

  silent: !process.env.CI,

  // Disable source map upload in low-memory environments
  sourcemaps: {
    disable: process.env.LOW_MEMORY_BUILD === "true",
  },

  widenClientFileUpload: true,

  tunnelRoute: "/monitoring",

  // Note: These are deprecated but still work. The warnings can be ignored for now.
  disableLogger: true,

  automaticVercelMonitors: true,
});