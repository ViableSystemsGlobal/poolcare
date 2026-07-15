import type { Metadata } from "next";
import "./globals.css";
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
    <html lang="en" data-display="sans">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <JsonLd data={[org, websiteSchema()]} />
        <CmsProvider initial={cmsContent}>
          <div id="root">{children}</div>
        </CmsProvider>
      </body>
    </html>
  );
}
