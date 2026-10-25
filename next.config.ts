import type { NextConfig } from "next";

import { CLERK_IMAGE_HOST } from "./src/lib/clerk-image";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: CLERK_IMAGE_HOST, port: "", pathname: "/**", search: "" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
};

export default nextConfig;
