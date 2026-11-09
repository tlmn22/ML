import type { Metadata, Viewport } from "next";
import { Exo_2, Inter } from "next/font/google";
import { DemoBanner, SiteFooter, SiteHeader, SiteTabBar } from "@/components/layout/site-chrome";
import { getDictionary } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });
const exo = Exo_2({ variable: "--font-exo", subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"] });

const t = getDictionary();

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: `${t.meta.siteName} — ${t.meta.tagline}`, template: `%s · ${t.meta.siteName}` },
  description: t.meta.description,
  openGraph: { siteName: t.meta.siteName, locale: "mn_MN", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#060a16",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="mn" className={`${inter.variable} ${exo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <DemoBanner />
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        <SiteFooter />
        <SiteTabBar />
      </body>
    </html>
  );
}
