// Server-only helpers to preload published CMS content for SSR.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/** All published docs as a { key: content } map. Empty object on any failure. */
export async function getAllPublished(): Promise<Record<string, any>> {
  try {
    const r = await fetch(`${API_BASE}/public/website`, { next: { revalidate: 60 } });
    if (!r.ok) return {};
    return (await r.json()).content || {};
  } catch {
    return {};
  }
}
