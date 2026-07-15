import type { Metadata } from "next";
import { StubPage } from "@/components/StubPage";
import { SITE_URL } from "@/lib/seo";

// Stub page: keep out of the index (and sitemap) until it has real content,
// but give it its own metadata so it never duplicates the homepage's.
export const metadata: Metadata = {
  title: "The PoolCare Team — Trained Pool Technicians in Accra",
  description:
    "Meet the trained technicians who keep Accra's pools clear, balanced and monitored. Full team profiles are coming soon.",
  alternates: { canonical: `${SITE_URL}/team` },
  robots: { index: false, follow: true },
};

export default function Team() {
  return (
    <StubPage
      cmsKey="page.team"
      eyebrow="Company — Team"
      title="The people behind your pool"
      body="Meet the trained technicians who keep Accra's pools clear, balanced, and monitored. This page is on the way."
    />
  );
}
