/**
 * Seed the "page.home" Website Studio doc (Homepage hero) from the values
 * hard-coded in Hero.jsx. Idempotent: skips if the doc already exists.
 *
 * Run: cd packages/db && DATABASE_URL=... DEFAULT_ORG_ID=... npx tsx prisma/seed-page-home.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HOME = {
  hero: {
    chip: "Book a pool assessment",
    title: "Your pool,",
    titleAccent: "expertly managed.",
    lead: "Not all pools require the same level of care. PoolCare plans are designed to match the complexity of your system and the level of control you expect — from flexible service-only maintenance to fully managed water systems.",
    ctaPrimary: { label: "Get an instant quote", href: "#quote" },
    ctaSecondary: { label: "View our plans", href: "/services-plans" },
    cardTitle: "Trusted across Accra",
    cardSubtitle: "Villas, communities & hospitality",
    badge: "Free water assessment on first visit",
    image: "/images/hero-pool.webp",
  },
};

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  const existing = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key: "page.home" } } });
  if (existing) { console.log(`"page.home" already exists for org ${org.name} — leaving it untouched.`); return; }

  await prisma.websiteContent.create({
    data: { orgId: org.id, key: "page.home", draft: HOME as any, published: HOME as any, publishedAt: new Date() },
  });
  console.log(`Seeded "page.home" (hero) for org ${org.name}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
