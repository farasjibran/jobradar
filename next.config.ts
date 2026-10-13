import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // node:sqlite is a Node builtin (experimental). Keep it external so
  // webpack/turbopack never tries to bundle or transform it.
  serverExternalPackages: ["node:sqlite"],
  // Ada lockfile lain di direktori induk (/Users/mac). Kunci root tracing
  // ke folder proyek supaya Next tidak salah menebak root workspace.
  outputFileTracingRoot: path.join(import.meta.dirname, "."),
};

export default nextConfig;
