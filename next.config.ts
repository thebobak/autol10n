import type { NextConfig } from "next";

const buildDate = new Date()
  .toISOString()          // "2026-06-29T14:23:00.000Z"
  .slice(0, 10)           // "2026-06-29"
  .replace(/-/g, '.')     // "2026.06.29"

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate,
  },
};

export default nextConfig;
