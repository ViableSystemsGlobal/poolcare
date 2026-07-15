/**
 * Seed the Website Studio "plans" content document from the values that were
 * previously hard-coded in apps/website/src/components/Pricing.jsx, so the live
 * site is identical on day one and then fully editable from the admin Studio.
 *
 * Run: cd packages/db && DATABASE_URL=... npx tsx prisma/seed-website.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLANS_CONTENT = {
  section: {
    eyebrow: "Pricing",
    title: "Choose the level of management your pool needs.",
    lead: "Four plans, tuned to the complexity of your system and the level of control you expect — from service-only maintenance to fully managed water systems.",
    note: "Indicative monthly ranges — final pricing is confirmed after a free on-site assessment. Flex excludes chemicals; Premium and above include them.",
  },
  plans: [
    {
      id: "flex",
      name: "Flex",
      href: "/flex",
      tag: "Service-only maintenance",
      blurb: "For clients who prefer to supply their own chemicals while receiving structured cleaning, system checks and water management guidance.",
      idealFor: "Any pool · client-supplied chemicals",
      priceFrom: 900,
      priceTo: 1400,
      currency: "GHS",
      cta: "Flex plan details",
      features: [
        "Routine cleaning and servicings",
        "Water testing and dosing guidance",
        "Equipment inspection and reporting",
        "Digital service logs",
      ],
      badges: ["Service-only", "48h response"],
      featured: false,
    },
    {
      id: "premium",
      name: "Premium",
      href: "/premium",
      tag: "Stable water management",
      blurb: "Designed for residential pools that require consistent servicing, balanced water chemistry and routine system care.",
      idealFor: "Pools up to 60 m³",
      priceFrom: 1600,
      priceTo: 2400,
      currency: "GHS",
      cta: "Premium plan details",
      features: [
        "Routine pool maintenance",
        "Water testing and chemical balancing",
        "Monthly flocculant treatment",
        "App-based service tracking",
      ],
      badges: ["Chemicals included", "48h response"],
      featured: false,
    },
    {
      id: "premium-plus",
      name: "Premium Plus",
      href: "/premium-plus",
      tag: "Performance & equipment care",
      blurb: "For pools requiring enhanced monitoring, proactive system care and improved water performance.",
      idealFor: "Pools 60–120 m³",
      priceFrom: 2500,
      priceTo: 3400,
      currency: "GHS",
      cta: "Premium Plus details",
      features: [
        "Everything in Premium",
        "Advanced water profiling",
        "Preventive equipment checks",
        "Algaecide and shock treatments",
      ],
      badges: ["Chemicals included", "24–36h priority"],
      featured: true,
    },
    {
      id: "luxury-villa",
      name: "Luxury Villa",
      href: "/luxury-villa",
      tag: "Elite water management",
      blurb: "A structured management program for high-end properties where water clarity and system integrity must remain uncompromised.",
      idealFor: "Large villas & estates · 60 m³+",
      priceFrom: 3500,
      priceTo: 4500,
      currency: "GHS",
      cta: "Luxury Villa details",
      features: [
        "Full water chemistry management",
        "Advanced system diagnostics",
        "Priority response scheduling",
        "Monthly performance reporting",
      ],
      badges: ["VIP priority", "12h target"],
      featured: false,
    },
  ],
};

async function main() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!org) throw new Error("No organization found — seed the org first.");

  // Seed BOTH draft and published so the live site renders immediately and the
  // Studio opens with content. Only create if missing — never clobber edits.
  const existing = await prisma.websiteContent.findUnique({
    where: { orgId_key: { orgId: org.id, key: "plans" } },
  });
  if (existing) {
    console.log(`"plans" content already exists for org ${org.name} — leaving it untouched.`);
    return;
  }

  await prisma.websiteContent.create({
    data: {
      orgId: org.id,
      key: "plans",
      draft: PLANS_CONTENT as any,
      published: PLANS_CONTENT as any,
      publishedAt: new Date(),
    },
  });
  console.log(`Seeded "plans" website content (draft + published) for org ${org.name}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
