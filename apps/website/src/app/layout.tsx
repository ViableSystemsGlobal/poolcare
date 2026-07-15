import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

// Self-hosted fonts (no render-blocking Google Fonts stylesheet, no
// third-party request): Geist via Vercel's package, Instrument Serif
// downloaded at build time by next/font.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});
import { JsonLd, organizationSchema, websiteSchema } from "@/lib/structured-data";
import { CmsProvider } from "@/lib/cms-context";
import { getAllPublished } from "@/lib/cms-server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://poolcare.africa";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "PoolCare — Your Pool. Our Expertise. Smartly Managed.",
  description:
    "Structured pool care for Accra — routine maintenance, water chemistry, equipment monitoring and restoration, run as a disciplined system.",
  openGraph: {
    type: "website",
    siteName: "PoolCare",
    images: ["/images/og-default.jpg"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [org, cmsContent] = await Promise.all([organizationSchema(), getAllPublished()]);
  return (
    // data-display mirrors the design handoff default (sans). The handoff's
    // dev-only Tweaks panel toggled this at runtime; the site ships the default.
    <html lang="en" data-display="sans" className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}>
      <body>
        <JsonLd data={[org, websiteSchema()]} />
        <CmsProvider initial={cmsContent}>
          <div id="root">{children}</div>
        </CmsProvider>
      </body>
    </html>
  );
}
