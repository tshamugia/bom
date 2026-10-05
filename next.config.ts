import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["192.168.2.177"],
  experimental: {
    // Catalog and BOM imports post .xlsx files of up to 10 MB to server actions
    // (the default limit is 1 MB); the extra room is multipart overhead.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
