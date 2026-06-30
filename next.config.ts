import type { NextConfig } from "next";

const d = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
// Local time so the build stamp matches the developer's clock, not UTC.
const buildDate = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${pad(d.getHours())}`
// e.g. "2026.06.29.14"

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate,
  },
};

export default nextConfig;
