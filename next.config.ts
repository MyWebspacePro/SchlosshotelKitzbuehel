import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["pg", "@electric-sql/pglite", "pdfkit"],
  outputFileTracingRoot: process.cwd(),
  images: { unoptimized: true },
  poweredByHeader: false,
  devIndicators: false
};
export default config;
