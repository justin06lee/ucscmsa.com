import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // No trailing slash, so /admin and /api themselves are covered too.
        // /login stays crawlable so its noindex is seen.
        disallow: ["/admin", "/api", "/timeline/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
