/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Electron
  output: "export",
  distDir: "out",
  trailingSlash: true,

  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,

  // Remove console logs in production
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "mjs-cms-app-production.up.railway.app",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "5000",
        pathname: "/uploads/**",
      },
    ],
  },

  webpack: (
    config: any,
    { isServer, dev }: { isServer: boolean; dev: boolean }
  ) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    if (!dev) {
      config.optimization = {
        ...config.optimization,
        minimize: true,
      };
    }

    return config;
  },

  turbopack: {},

  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

module.exports = nextConfig;
