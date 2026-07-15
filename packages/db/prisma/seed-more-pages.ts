/**
 * Seed the remaining website pages: stubs (blog, case-studies, careers, team),
 * services-plans + assessment heroes, and the 3 legal docs. Idempotent.
 * Run: cd packages/db && DATABASE_URL=... DEFAULT_ORG_ID=... npx tsx prisma/seed-more-pages.ts
 */
import { PrismaClient } from "@prisma/client";
import { LEGAL_DOCS } from "../../../apps/website/src/data/legal";

const prisma = new PrismaClient();

const PAGES: Record<string, any> = {
  "page.blog": { eyebrow: "Resources — Blog", title: "Pool care tips & guides", body: "Practical advice on water chemistry, equipment, and keeping your pool reliable year-round. Articles are on the way." },
  "page.case-studies": { eyebrow: "Resources — Case Studies", title: "Real PoolCare projects", body: "See how we restored and now manage pools for villas, gated communities, and hospitality properties across Accra. Coming soon." },
  "page.careers": { eyebrow: "Company — Careers", title: "We're hiring", body: "PoolCare is growing its team of technicians and support staff. Open roles and how to apply will be listed here soon." },
  "page.team": { eyebrow: "Company — Team", title: "The people behind your pool", body: "Meet the trained technicians who keep Accra's pools clear, balanced, and monitored. This page is on the way." },
  "page.services-plans": {
    hero: {
      eyebrow: "Services & Plans",
      title: "Complete pool care, on a plan that fits.",
      subtitle: "Every service we run and the four management plans they map to — from service-only maintenance to fully managed water systems.",
      image: "https://images.unsplash.com/photo-1572331165267-854da2b10ccc?w=2400&q=80&auto=format&fit=crop",
    },
  },
  "page.assessment": {
    hero: {
      eyebrow: "Get started",
      title: "Book your free pool assessment.",
      subtitle: "Tell us about your pool and our team will evaluate your system, water condition and service requirements — then recommend the right plan.",
      image: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=2400&q=80&auto=format&fit=crop",
    },
  },
  "page.disclaimer": LEGAL_DOCS["disclaimer"],
  "page.privacy-policy": LEGAL_DOCS["privacy-policy"],
  "page.terms": LEGAL_DOCS["terms"],
};

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  for (const [key, content] of Object.entries(PAGES)) {
    const existing = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key } } });
    if (existing) { console.log(`${key} exists — skipped.`); continue; }
    await prisma.websiteContent.create({ data: { orgId: org.id, key, draft: content as any, published: content as any, publishedAt: new Date() } });
    console.log(`Seeded ${key}.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
