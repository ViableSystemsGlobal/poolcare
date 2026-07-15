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
export function planMetadata(planId: string): Promise<Metadata> {
  return pageMetadata({
    key: "plans",
    path: `/${planId}`,
    fallbackTitle: `${planId.replace(/-/g, " ")} plan — PoolCare`,
    pick: (c) => {
      const p = (c?.plans || []).find((x: any) => x.id === planId);
      return p ? { title: p.detail?.title || `${p.name} Plan`, description: p.detail?.tagline || p.blurb, image: p.detail?.image } : {};
    },
  });
}
