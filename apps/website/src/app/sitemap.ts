import type { MetadataRoute } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://poolcare.africa";

// /team is a noindexed stub — add it back here when it gets real content
// (and drop the robots noindex in its page.tsx).
const STATIC = [
  "", "/services-plans", "/products", "/about", "/contact", "/assessment",
  "/flex", "/premium", "/premium-plus", "/luxury-villa",
  "/blog", "/case-studies", "/careers",
  "/disclaimer", "/privacy-policy", "/terms",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fetchPosts = async (type: string) => {
    try {
      const r = await fetch(`${API_BASE}/public/blog?type=${type}`, { next: { revalidate: 300 } });
      return r.ok ? (await r.json()).posts || [] : [];
    } catch { return []; }
  };
  const fetchRoles = async () => {
    try {
      const r = await fetch(`${API_BASE}/public/careers`, { next: { revalidate: 300 } });
      return r.ok ? (await r.json()).postings || [] : [];
    } catch { return []; }
  };
  const [articles, studies, roles] = await Promise.all([fetchPosts("article"), fetchPosts("case-study"), fetchRoles()]);

  return [
    ...STATIC.map((p) => ({ url: `${SITE}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...articles.map((p: any) => ({ url: `${SITE}/blog/${p.slug}`, lastModified: p.publishedAt ? new Date(p.publishedAt) : undefined, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...studies.map((p: any) => ({ url: `${SITE}/case-studies/${p.slug}`, lastModified: p.publishedAt ? new Date(p.publishedAt) : undefined, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...roles.map((r: any) => ({ url: `${SITE}/careers/${r.slug}`, lastModified: r.postedAt ? new Date(r.postedAt) : undefined, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
