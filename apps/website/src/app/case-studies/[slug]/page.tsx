import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { mdToHtml } from "@/lib/markdown";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://poolcare.africa";

async function getStudy(slug: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}/public/blog/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getStudy(params.slug);
  if (!post) return { title: "Case study not found — PoolCare" };
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || undefined;
  const url = `${SITE_URL}/case-studies/${post.slug}`;
  const image = post.ogImage || post.afterImage || post.coverImage || `${SITE_URL}/images/og-default.jpg`;
  return {
    title: /poolcare/i.test(title) ? title : `${title} — PoolCare`,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title, description, url, images: image ? [image] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

export default async function CaseStudy({ params }: { params: { slug: string } }) {
  const post = await getStudy(params.slug);
  if (!post) notFound();

  const html = mdToHtml(post.body);
  const url = `${SITE_URL}/case-studies/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription || post.excerpt || undefined,
    image: post.ogImage || post.afterImage || post.coverImage || undefined,
    datePublished: post.publishedAt || undefined,
    author: { "@type": "Organization", name: "PoolCare" },
    publisher: { "@type": "Organization", name: "PoolCare" },
    mainEntityOfPage: url,
  };

  return (
    <>
      <Nav home="/" />
      <main>
        <PageHero
          eyebrow={post.client ? `Case study · ${post.client}` : "Case study"}
          title={post.title}
          subtitle={post.excerpt || ""}
          image={post.coverImage || post.afterImage || "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=2400&q=80&auto=format&fit=crop"}
        />
        <article className="section">
          <div className="wrap" style={{ maxWidth: 860 }}>
            {post.beforeImage && post.afterImage && (
              <div className="r-grid-2" style={{ gap: 16, marginBottom: 40 }}>
                {[["Before", post.beforeImage], ["After", post.afterImage]].map(([label, src]) => (
                  <div key={label} style={{ position: "relative", borderRadius: 16, overflow: "hidden", aspectRatio: "4 / 3", background: "var(--surface-2)" }}>
                    <img src={src as string} alt={label as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <span style={{ position: "absolute", top: 12, left: 12, background: label === "Before" ? "rgba(10,31,58,0.85)" : "rgba(255,255,255,0.92)", color: label === "Before" ? "#fff" : "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 999 }}>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {post.outcome && (
              <div style={{ padding: "20px 24px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, marginBottom: 32 }}>
                <div className="h-eyebrow" style={{ marginBottom: 6 }}>Outcome</div>
                <div style={{ fontSize: 17, fontWeight: 500, color: "var(--ink)" }}>{post.outcome}</div>
              </div>
            )}

            <div className="blog-body" dangerouslySetInnerHTML={{ __html: html }} />

            <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--line)", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a className="btn btn-lg" href="/assessment">Book a pool assessment</a>
              <a className="btn btn-outline btn-lg" href="/case-studies">More case studies</a>
            </div>
          </div>
        </article>
      </main>
      <Footer home="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
