import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.CHATPAY_BUILD_DIR || ".next",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "tailwind.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
