/**
 * Add the Booking (assessment) + Area (about) heading copy into their page docs.
 * Idempotent (only adds the sub-key if missing).
 * Run: cd packages/db && DATABASE_URL=... DEFAULT_ORG_ID=... npx tsx prisma/seed-widgets.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const ADDITIONS: Record<string, { sub: string; value: any }> = {
  "page.assessment": {
    sub: "booking",
    value: { eyebrow: "Book a pool assessment", title: "Let our team", titleAccent: "evaluate your system." },
  },
  "page.about": {
    sub: "area",
    value: {
      eyebrow: "Service area",
      title: "From East Legon to",
      titleAccent: "Trasacco,",
      titleEnd: " across Accra.",
      lead: "We provide professional pool maintenance and water management to residential and commercial properties across Accra — and also serve Kumasi and Takoradi.",
    },
  },
};

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  for (const [key, { sub, value }] of Object.entries(ADDITIONS)) {
    const doc = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key } } });
    if (!doc) { console.log(`${key} missing — skipped.`); continue; }
    const add = (obj: any) => (obj && obj[sub] === undefined ? { ...obj, [sub]: value } : obj);
    const draft = add(doc.draft);
    const published = doc.published ? add(doc.published) : draft;
    await prisma.websiteContent.update({ where: { orgId_key: { orgId: org.id, key } }, data: { draft, published, publishedAt: new Date() } });
    console.log(`Added "${sub}" to ${key}.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
