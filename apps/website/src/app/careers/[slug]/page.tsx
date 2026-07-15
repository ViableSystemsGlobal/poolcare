import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { mdToHtml } from "@/lib/markdown";
import { SITE_URL, DEFAULT_OG_IMAGE, breadcrumbSchema } from "@/lib/seo";
import ApplyForm from "./apply-form";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const EMPLOYMENT_TYPE_SCHEMA: Record<string, string> = {
  "full-time": "FULL_TIME",
  "part-time": "PART_TIME",
  contract: "CONTRACTOR",
};
const TYPE_LABEL: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
};

async function getRole(slug: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}/public/careers/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const role = await getRole(params.slug);
  if (!role) return { title: "Role not found — PoolCare" };
  const title = `${role.title} — Careers at PoolCare`;
  const description = role.summary || `Apply for the ${role.title} role at PoolCare in ${role.location}.`;
  const url = `${SITE_URL}/careers/${role.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "PoolCare", images: [DEFAULT_OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [DEFAULT_OG_IMAGE] },
  };
}

export default async function RolePage({ params }: { params: { slug: string } }) {
  const role = await getRole(params.slug);
  if (!role) notFound();

  const descriptionHtml = mdToHtml(role.description);
  const requirementsHtml = role.requirements ? mdToHtml(role.requirements) : null;

  // JobPosting structured data → eligible for Google's job search experience.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: role.title,
    description: descriptionHtml + (requirementsHtml || ""),
    datePosted: role.postedAt || undefined,
    validThrough: role.closesAt || undefined,
    employmentType: EMPLOYMENT_TYPE_SCHEMA[role.employmentType] || "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: "PoolCare",
      sameAs: SITE_URL,
      logo: `${SITE_URL}/images/logo.png`,
    },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: role.location || "Accra", addressCountry: "GH" },
    },
    directApply: true,
  };

  const meta = [role.department, role.location, TYPE_LABEL[role.employmentType] || role.employmentType, role.salaryRange]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Nav home="/" />
      <main>
        <PageHero
          eyebrow="Careers"
          title={role.title}
          subtitle={meta}
          image="https://images.unsplash.com/photo-1572331165267-854da2b10ccc?w=2400&q=80&auto=format&fit=crop"
        />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            {role.closesAt && (
              <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 0 }}>
                Applications close {new Date(role.closesAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
              </p>
            )}
            <div className="blog-body" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
            {requirementsHtml && (
              <>
                <h2 style={{ marginTop: 40 }}>What we're looking for</h2>
                <div className="blog-body" dangerouslySetInnerHTML={{ __html: requirementsHtml }} />
              </>
            )}
            <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--line)" }}>
              <h2 style={{ marginTop: 0 }}>Apply for this role</h2>
              <ApplyForm slug={role.slug} roleTitle={role.title} />
            </div>
            <div style={{ marginTop: 32 }}>
              <a className="btn btn-outline" href="/careers">← All open roles</a>
            </div>
          </div>
        </section>
      </main>
      <Footer home="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Careers", path: "/careers" },
        { name: role.title, path: `/careers/${role.slug}` },
      ])) }} />
    </>
  );
}
