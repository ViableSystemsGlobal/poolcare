/**
 * Add an editable `seo` block { title, description } to each page content doc.
 * The website's generateMetadata prefers content.seo, so editors can tune SEO
 * per page in the Studio. Idempotent (only adds if missing).
 * Run: cd packages/db && DATABASE_URL=... DEFAULT_ORG_ID=... npx tsx prisma/seed-seo.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SEO: Record<string, { title: string; description: string }> = {
  "page.home": { title: "PoolCare — Professional Pool Maintenance in Accra, Ghana", description: "Structured pool care for Accra — routine maintenance, water chemistry, equipment monitoring and restoration, run as a disciplined system." },
  "page.about": { title: "About PoolCare — Our Team & System", description: "The structured system, disciplined approach and trained technicians behind every PoolCare visit in Accra." },
  "page.contact": { title: "Contact PoolCare — Pool Service in Accra", description: "Get in touch with PoolCare for pool maintenance, repairs and water management across Accra, Kumasi and Takoradi." },
  "page.services-plans": { title: "Services & Plans — PoolCare", description: "Every pool service we run and the four management plans — from service-only maintenance to fully managed water systems." },
  "page.assessment": { title: "Book a Free Pool Assessment — PoolCare", description: "Book your free pool assessment in Accra. We evaluate your system, water condition and recommend the right plan." },
  "page.blog": { title: "Pool Care Tips & Guides — PoolCare Blog", description: "Practical advice on water chemistry, equipment and keeping your pool reliable year-round." },
  "page.case-studies": { title: "Case Studies — Real PoolCare Projects", description: "See how PoolCare restored and now manages pools for villas, communities and hospitality properties across Accra." },
  "page.disclaimer": { title: "Disclaimer — PoolCare", description: "The disclaimers that apply to the PoolCare website." },
  "page.privacy-policy": { title: "Privacy Policy — PoolCare", description: "How PoolCare collects, uses and protects your information." },
  "page.terms": { title: "Terms & Conditions — PoolCare", description: "The terms and conditions for using the PoolCare website and services." },
};

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  for (const [key, seo] of Object.entries(SEO)) {
    const doc = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key } } });
    if (!doc) { console.log(`${key} missing — skipped.`); continue; }
    const add = (obj: any) => (obj && obj.seo === undefined ? { ...obj, seo: { ...seo, ogImage: "" } } : obj);
    const draft = add(doc.draft);
    const published = doc.published ? add(doc.published) : draft;
    await prisma.websiteContent.update({ where: { orgId_key: { orgId: org.id, key } }, data: { draft, published, publishedAt: new Date() } });
    console.log(`Added seo to ${key}.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
