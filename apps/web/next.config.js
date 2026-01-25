/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@poolcare/ui"],
  output: "standalone",
  // Disable Router Cache for dynamic data
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  // Ensure path aliases work correctly
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": require("path").resolve(__dirname, "./src"),
    };
    return config;
  },
  // Add headers to prevent browser caching of pages
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

