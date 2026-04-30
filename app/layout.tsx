import type { Metadata } from "next";
import { Amiri, Inter } from "next/font/google";
import { BoilTickerProvider } from "@/components/logo/boil-ticker";
import "./globals.css";

const amiri = Amiri({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-amiri",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "MSA at UCSC",
  description: "The Muslim Student Association at the University of California, Santa Cruz.",
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
        <BoilTickerProvider intervalMs={1000}>{children}</BoilTickerProvider>
      </body>
    </html>
  );
}
