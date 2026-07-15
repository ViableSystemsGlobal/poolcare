import type { Metadata } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://poolcare.africa";
// Branded 1200×630 card shown when a page has no Studio/content image —
// without it, WhatsApp/Facebook/Twitter shares render with no image at all.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og-default.jpg`;

async function getContent(key: string): Promise<any | null> {
  try {
    const r = await fetch(`${API_BASE}/public/website/${key}`, { next: { revalidate: 60 } });
    return r.ok ? (await r.json()).content : null;
  } catch {
    return null;
  }
}

/**
 * Build per-page Metadata. Priority: explicit `content.seo` (editable in the
 * Studio) → values derived by `pick(content)` → the provided fallbacks.
 */
export async function pageMetadata(opts: {
  key?: string;
  path: string;
  fallbackTitle: string;
  fallbackDesc?: string;
  pick?: (c: any) => { title?: string; description?: string; image?: string };
}): Promise<Metadata> {
  const content = opts.key ? await getContent(opts.key) : null;
  const seo = (content && content.seo) || {};
  const picked = opts.pick && content ? opts.pick(content) : {};
  const title = seo.title || picked.title || opts.fallbackTitle;
  const description = seo.description || picked.description || opts.fallbackDesc;
  const image = seo.ogImage || picked.image || DEFAULT_OG_IMAGE;
  const url = `${SITE_URL}${opts.path}`;
  const fullTitle = /poolcare/i.test(title) ? title : `${title} — PoolCare`;

  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    openGraph: { title: fullTitle, description, url, type: "website", siteName: "PoolCare", images: [image] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image] },
  };
}

// SEO for a plan detail page (derived from that plan in the "plans" doc).
// Title is deliberately NOT the marketing headline (those run 80+ chars and
// get truncated in SERPs) — it's a compact, keyworded pattern. A Studio
// `seo.title` still overrides everything.
export function planMetadata(planId: string): Promise<Metadata> {
  return pageMetadata({
    key: "plans",
    path: `/${planId}`,
    fallbackTitle: `${planId.replace(/-/g, " ")} plan — PoolCare`,
    pick: (c) => {
      const p = (c?.plans || []).find((x: any) => x.id === planId);
      if (!p) return {};
      const tagline = p.detail?.tagline || p.blurb || "";
      const description = [tagline, "Professional pool maintenance in Accra by PoolCare — book a free assessment."]
        .filter(Boolean).join(" ").slice(0, 155);
      return {
        title: `${p.name} Plan — Pool Maintenance in Accra`,
        description,
        image: p.detail?.image,
      };
    },
  });
}

// Service + Offer structured data for a plan page.
export async function planServiceSchema(planId: string) {
  const content = await getContent("plans");
  const p = (content?.plans || []).find((x: any) => x.id === planId);
  if (!p) return null;
  const price = typeof p.price === "string" || typeof p.price === "number"
    ? String(p.price).replace(/[^\d.]/g, "")
    : "";
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${SITE_URL}/${planId}#service`,
    name: `${p.name} Plan — Pool Maintenance`,
    serviceType: "Swimming pool maintenance",
    description: p.detail?.tagline || p.blurb || undefined,
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: { "@type": "City", name: "Accra" },
    url: `${SITE_URL}/${planId}`,
    ...(price ? { offers: { "@type": "Offer", price, priceCurrency: "GHS" } } : {}),
  };
}

// BreadcrumbList — helps SERP display for deep pages.
export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
