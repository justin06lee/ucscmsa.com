import { ImageResponse } from "next/og";
import { OG_SIZE, SiteCard, ogAssets } from "@/components/og/og-card";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";

// The share image for every page without its own (event pages have one).
export const alt = DEFAULT_OG_IMAGE.alt;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const a = await ogAssets();
  return new ImageResponse(<SiteCard a={a} />, { ...size, fonts: a.fonts });
}
