import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { mdToHtml } from "@/lib/markdown";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://poolcare.africa";

async function getPost(slug: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}/public/blog/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return { title: "Article not found — PoolCare" };
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || undefined;
  const url = `${SITE_URL}/blog/${post.slug}`;
  const image = post.ogImage || post.coverImage || `${SITE_URL}/images/og-default.jpg`;
  return {
    title: /poolcare/i.test(title) ? title : `${title} — PoolCare`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      images: image ? [image] : undefined,
      publishedTime: post.publishedAt || undefined,
      authors: post.author ? [post.author] : undefined,
    },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
}

export default async function BlogPost({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  const html = mdToHtml(post.body);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt || undefined,
    image: post.ogImage || post.coverImage || undefined,
    datePublished: post.publishedAt || undefined,
    dateModified: post.updatedAt || undefined,
    author: { "@type": "Organization", name: post.author || "PoolCare" },
    publisher: { "@type": "Organization", name: "PoolCare" },
    mainEntityOfPage: url,
  };

  return (
    <>
      <Nav home="/" />
      <main>
        <PageHero
          eyebrow={post.tags?.[0] ? `Blog · ${post.tags[0]}` : "Blog"}
          title={post.title}
          subtitle={post.excerpt || ""}
          image={post.coverImage || "https://images.unsplash.com/photo-1572331165267-854da2b10ccc?w=2400&q=80&auto=format&fit=crop"}
        />
        <article className="section">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginBottom: 32 }}>
              {fmtDate(post.publishedAt)} · {post.author || "PoolCare"}
            </div>
            <div className="blog-body" dangerouslySetInnerHTML={{ __html: html }} />
            <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--line)", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a className="btn btn-lg" href="/assessment">Book a pool assessment</a>
              <a className="btn btn-outline btn-lg" href="/blog">More articles</a>
            </div>
          </div>
        </article>
      </main>
      <Footer home="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
