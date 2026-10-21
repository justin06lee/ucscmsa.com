import type { Metadata } from "next";
import { Amiri, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { BoilTickerProvider } from "@/components/logo/boil-ticker";
import {
  IS_PREVIEW_DEPLOYMENT,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_URL,
  SITE_VERIFICATION,
} from "@/lib/site";
import "./globals.css";

// Headings only, at weight 400 (globals.css); every italic on the site is
// Inter. Bold and italic Amiri were three extra preloaded files on every page.
const amiri = Amiri({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-amiri",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const indexable = !IS_PREVIEW_DEPLOYMENT;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_SHORT_NAME} — Muslim Student Association at UC Santa Cruz`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "education",
  // No title, description or url here: pages that don't set openGraph get
  // their own title and description, and the image from app/opengraph-image.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: indexable,
    follow: indexable,
    googleBot: {
      index: indexable,
      follow: indexable,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: SITE_VERIFICATION.google,
    ...(SITE_VERIFICATION.bing ? { other: { "msvalidate.01": SITE_VERIFICATION.bing } } : {}),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${amiri.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-paper focus:text-ink focus:px-3 focus:py-2 focus:rounded-md focus:border focus:border-ink/30"
        >
          Skip to main content
        </a>
        <BoilTickerProvider intervalMs={1000}>{children}</BoilTickerProvider>
        <Analytics />
      </body>
    </html>
  );
}
