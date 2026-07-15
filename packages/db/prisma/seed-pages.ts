/**
 * Seed the About and Contact page content docs. Idempotent (skips if present).
 * Run: cd packages/db && DATABASE_URL=... DEFAULT_ORG_ID=... npx tsx prisma/seed-pages.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const PAGES: Record<string, any> = {
  "page.about": {
    hero: {
      eyebrow: "About",
      title: "The team and system behind PoolCare.",
      subtitle: "The structured system, disciplined approach and trained technicians behind every PoolCare visit.",
      image: "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=2400&q=80&auto=format&fit=crop",
    },
    body: {
      eyebrow: "About our company",
      lead: "A swimming pool is not just water. It is a system that requires",
      leadAccent: " consistency, control and precision.",
      operateEyebrow: "How we operate",
      operateTitle: "We don't just maintain pools, we manage them.",
      operateText: "We manage pools through disciplined systems, not guesswork. Every service is structured to maintain water balance, protect equipment, and deliver consistent results over time.",
      approachEyebrow: "Our approach",
      approachTitle: "Built on discipline, not assumption.",
      approachText: "We test, balance and track water conditions to maintain long-term stability. Our focus:",
      focus: ["Prevention over repair", "Data over assumption", "Discipline over shortcuts", "Long-term protection"],
      whyEyebrow: "Why PoolCare — what sets us apart",
      why: [
        { n: "01", t: "Documented every visit", d: "Each service is logged with checks, testing and the actions taken." },
        { n: "02", t: "Water chemistry managed professionally", d: "Tested, balanced and tracked to maintain long-term stability." },
        { n: "03", t: "Structured technician workflows", d: "Trained technicians operate to a defined process, not guesswork." },
        { n: "04", t: "Equipment monitoring & reporting", d: "Condition is inspected and reported so issues surface early." },
      ],
      ctaTitle: "Ready for professional pool management?",
      ctaText: "Book a pool assessment and let our team evaluate your system, water condition and service requirements.",
      ctaLabel: "Book a pool assessment",
    },
    team: {
      eyebrow: "Team",
      title: "The people behind your pool",
      lead: "Meet the trained technicians who keep Accra's pools clear, balanced, and monitored. Full team profiles are on the way.",
    },
  },
  "page.contact": {
    hero: {
      eyebrow: "Contact",
      title: "Get in touch.",
      subtitle: "From cloudy water to equipment issues, our team is ready to help solve your pool maintenance needs.",
      image: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=2400&q=80&auto=format&fit=crop",
    },
    contactDetails: {
      phone: "(+233) 50 622 6222", phoneHref: "tel:+233506226222",
      email: "info@poolcare.africa", emailHref: "mailto:info@poolcare.africa",
      office: "44 Nii Obodaifio Street, Mempeasem, Accra",
    },
    serviceAreas: {
      heading: "Service areas",
      items: ["Accra", "East Legon", "Cantonments", "Trasacco", "Spintex"],
      note: "Professional pool services across Accra — and Kumasi & Takoradi.",
    },
    help: {
      heading: "What we help with",
      items: ["Pool Equipment Repair", "Pool Restoration & Deep Cleaning", "Equipment Inspection & Servicing", "Pool System Monitoring", "Water Chemistry Management"],
    },
    form: { heading: "Send us a message" },
  },
};

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  for (const [key, content] of Object.entries(PAGES)) {
    const existing = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key } } });
    if (existing) { console.log(`${key} already exists — skipped.`); continue; }
    await prisma.websiteContent.create({ data: { orgId: org.id, key, draft: content, published: content, publishedAt: new Date() } });
    console.log(`Seeded ${key}.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
