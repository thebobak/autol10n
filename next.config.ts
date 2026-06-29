import type { NextConfig } from "next";

const buildDate = new Date()
  .toISOString()          // "2026-06-29T14:23:00.000Z"
  .slice(0, 10)           // "2026-06-29"
  .replace(/-/g, '.')     // "2026.06.29"

// Kubernetes injects KUBERNETES_SERVICE_HOST into every pod. When present,
// the container runs as `nonroot` and cannot write to /app (owned by root).
// /tmp is always writable regardless of the running user.
const distDir = process.env.KUBERNETES_SERVICE_HOST ? '/tmp/.next' : '.next'

const nextConfig: NextConfig = {
  distDir,
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate,
  },
};

export default nextConfig;
