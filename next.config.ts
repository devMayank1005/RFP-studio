import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The user guide page reads docs/user-guide.md at request time; trace it into that route's bundle.
  outputFileTracingIncludes: { "/docs/guide": ["./docs/**/*"] },
  experimental: {
    serverActions: {
      // RFP uploads go through a server action; the default 1 MB would refuse
      // most spreadsheets with embedded formatting, let alone a PDF.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
