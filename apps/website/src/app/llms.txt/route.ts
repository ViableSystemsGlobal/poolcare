const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://poolcare.africa";

// /llms.txt — the emerging "robots.txt for LLMs": a curated, markdown map of the
// site so AI answer engines can ground responses in the right pages. See llmstxt.org.
export const revalidate = 300;

async function fetchPosts(type: string): Promise<any[]> {
  try {
    const r = await fetch(`${API_BASE}/public/blog?type=${type}`, { next: { revalidate: 300 } });
    return r.ok ? (await r.json()).posts || [] : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const [articles, studies] = await Promise.all([fetchPosts("article"), fetchPosts("case-study")]);

  const lines: string[] = [
    "# PoolCare",
    "",
    "> Structured pool maintenance and water management for Accra and across Ghana. PoolCare runs pool care as a documented system — routine servicing, water chemistry, equipment monitoring, and green-pool restoration — with every visit tracked in the PoolCare app.",
    "",
    "Service areas: Accra (East Legon, Cantonments, Trasacco, Spintex), Kumasi, Takoradi.",
    "Contact: info@poolcare.africa · (+233) 50 622 6222",
    "",
    "## Plans",
    `- [Flex](${SITE}/flex): Service-only maintenance; you supply chemicals.`,
    `- [Premium](${SITE}/premium): Full water chemistry management for pools up to 60 m³.`,
    `- [Premium Plus](${SITE}/premium-plus): Equipment and performance care for 60–120 m³ pools, incl. salt systems.`,
    `- [Luxury Villa](${SITE}/luxury-villa): Elite water management for large villas and estates (60 m³+).`,
    "",
    "## Key pages",
    `- [Services & Plans](${SITE}/services-plans): All maintenance plans and what each includes.`,
    `- [Book an Assessment](${SITE}/assessment): Free on-site pool assessment before a plan is assigned.`,
    `- [About](${SITE}/about): How PoolCare works and the areas served.`,
    `- [Contact](${SITE}/contact): Phone, email and service areas.`,
    "",
  ];

  if (articles.length) {
    lines.push("## Blog — pool care guides");
    for (const p of articles.slice(0, 50)) {
      lines.push(`- [${p.title}](${SITE}/blog/${p.slug})${p.excerpt ? `: ${p.excerpt}` : ""}`);
    }
    lines.push("");
  }

  if (studies.length) {
    lines.push("## Case studies");
    for (const p of studies.slice(0, 50)) {
      lines.push(`- [${p.title}](${SITE}/case-studies/${p.slug})${p.excerpt ? `: ${p.excerpt}` : ""}`);
    }
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
