import type { NextConfig } from "next";
import { blobHostForToken } from "./lib/blob-host";

// Sent on every response. No script-src policy yet: that needs nonces for
// Next's inline scripts and Vercel Analytics, so it's left for its own change.
export const securityHeaders = [
  // Nobody may frame the site, so admin buttons (approve, delete) can't be
  // clickjacked. X-Frame-Options covers browsers without frame-ancestors.
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

// Event images are served from the public Blob store (lib/storage.ts).
const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
const blobHost = blobToken ? blobHostForToken(blobToken) : null;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: blobHost ?? "*.public.blob.vercel-storage.com",
      pathname: "/flyers/**",
    }],
  },
  experimental: {
    serverActions: {
      // Admin image uploads; Vercel refuses request bodies over 4.5 MB anyway.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
