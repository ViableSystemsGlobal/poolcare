/**
 * Merge plan DETAIL content (from PlanPage.jsx PLAN_DATA) into each plan of the
 * existing "plans" WebsiteContent doc, under `plan.detail`. Idempotent: re-running
 * refreshes detail only for plans that don't already have it edited.
 *
 * Run: cd packages/db && DATABASE_URL=... npx tsx prisma/seed-plan-details.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DETAIL: Record<string, any> = {
  flex: {
    index: "01",
    title: "The Flex Package — professional maintenance, flexible chemical supply",
    tagline: "Service-only maintenance. You supply the chemicals; we run the system.",
    image: "https://images.unsplash.com/photo-1572331165267-854da2b10ccc?w=2400&q=80&auto=format&fit=crop",
    idealChips: [],
    response: "48-hour response for technical issues. Emergencies assessed separately.",
    groups: [
      { title: "Pool cleaning", items: ["Surface skimming", "Manual vacuuming", "Wall brushing", "Waterline cleaning"] },
      { title: "Filtration & circulation", items: ["Skimmer basket cleaning", "Pump basket cleaning", "Filter backwashing", "Pump operation inspection"] },
      { title: "Water testing & advisory", items: ["pH testing", "Free chlorine testing", "Total alkalinity testing", "Calcium hardness testing", "Chemical dosing guidance"] },
      { title: "Equipment monitoring", items: ["Visual pump inspection", "Filter integrity check", "Valve condition check", "Pipework inspection", "Early fault reporting"] },
      { title: "Digital reporting", items: ["Digital service report after every visit", "Service log history via PoolCare app", "Maintenance recommendations logged"] },
    ],
    chemicals: {
      label: "Chemicals — client supplied",
      note: "You provide treatment chemicals; PoolCare handles structured servicing, testing and dosing guidance.",
      items: ["Chlorine", "pH+ / pH−", "Algaecides", "Flocculants", "Clarifiers"],
    },
  },
  premium: {
    index: "02",
    title: "Premium Package — essential water stability, consistency & peace of mind",
    tagline: "Stable water management for residential pools that need consistent care.",
    image: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=2400&q=80&auto=format&fit=crop",
    idealChips: ["Small to mid-size pools (up to 60 m³)", "Basic circulation systems", "Low to moderate usage homes"],
    response: "48-hour non-emergency response.",
    groups: [
      { title: "Cleaning services", items: ["Surface skimming", "Manual vacuuming", "Wall brushing", "Skimmer & pump basket cleaning", "Filter backwashing", "Pump inspection"] },
      { title: "Water management", items: ["pH, chlorine, alkalinity & total hardness testing", "Chlorine dosing", "pH adjustment included", "Monthly routine flocculant treatment"] },
      { title: "Reporting & service", items: ["Digital service report after each visit", "App-based tracking", "48-hour non-emergency response"] },
    ],
    chemicals: {
      label: "Chemicals — included",
      note: "Treatment chemicals are included within your monthly plan.",
      items: ["Chlorine", "pH+ / pH−", "Flocculants"],
    },
  },
  "premium-plus": {
    index: "03",
    title: "Premium Plus Plan — managed water performance & equipment longevity",
    tagline: "Performance and equipment care for active mid-to-large pools.",
    image: "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=2400&q=80&auto=format&fit=crop",
    idealChips: ["Mid to large pools (60–120 m³)", "Salt chlorination systems", "Automated dosing systems", "Moderate to high usage"],
    response: "24–36 hour priority response. Priority scheduling for technical issues.",
    groups: [
      { title: "Everything in Premium", items: ["Surface skimming, manual vacuuming, wall brushing", "Basket cleaning, filter backwashing, pump inspection", "Full water testing", "Digital service reports", "App tracking"] },
      { title: "Plus — advanced care", items: ["Salt cell inspection & calibration", "Full water balance profiling", "Bi-weekly algaecide dosing", "Quarterly tile descaling", "Equipment lubrication", "Filter media inspection", "One preventive equipment inspection monthly"] },
      { title: "Reporting", items: ["Digital log per visit", "App-based tracking", "Monthly performance summary report"] },
    ],
    chemicals: {
      label: "Chemicals — all included",
      note: "All chemicals are included within the plan.",
      items: ["Chlorine / salt system management", "pH control chemicals", "Flocculants", "Shock treatments", "Algae remediation treatments", "Scale & stain controllers", "Clarifiers"],
    },
  },
  "luxury-villa": {
    index: "04",
    title: "Luxury Villa Plan — elite water management, prestige & asset protection",
    tagline: "Complete water governance for high-end villas, estates and water features.",
    image: "https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=2400&q=80&auto=format&fit=crop",
    idealChips: ["Large villas & estates (60 m³+)", "Infinity & overflow pools", "Properties with spas or water features", "Diplomatic, executive & premium residences"],
    priceReal: true,
    response: "VIP priority — target response within 12 working hours.",
    groups: [
      { title: "Everything in Premium Plus", items: ["All Premium Plus services", "Full chemical management", "Water balance profiling", "Bi-weekly algaecide", "Quarterly tile descaling", "Equipment lubrication"] },
      { title: "Advanced water chemistry", items: ["TDS monitoring", "Calcium hardness management", "Advanced water chemistry profiling", "Overflow trough cleaning", "UV / Ozone system inspection"] },
      { title: "Elite equipment care", items: ["Heater system inspection", "Quarterly equipment room audit", "Annual full filter media change", "Bi-annual tile line polishing", "Weekly equipment diagnostics", "Quarterly deep service"] },
      { title: "Governance & reporting", items: ["App-based service management", "Digital log per visit", "Monthly performance analytics report", "Annual water performance summary"] },
    ],
    chemicals: {
      label: "Chemicals — fully managed",
      note: "All water treatment chemicals are included within the structured management scope. No additional chemical costs — complete water governance.",
      items: ["Complete water treatment chemistry", "Salt system management", "Scale & stain control", "Shock & algae remediation", "Clarifiers & specialty treatments"],
    },
  },
};

function mergeDetail(content: any) {
  if (!content?.plans) return content;
  content.plans = content.plans.map((p: any) => {
    if (p.detail) return p; // don't clobber edited detail
    const d = DETAIL[p.id];
    return d ? { ...p, detail: d } : p;
  });
  return content;
}

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  const doc = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key: "plans" } } });
  if (!doc) throw new Error(`No "plans" content for org ${org.name} — run seed-website.ts first.`);

  const draft = mergeDetail(structuredClone(doc.draft));
  const published = doc.published ? mergeDetail(structuredClone(doc.published)) : null;

  await prisma.websiteContent.update({
    where: { orgId_key: { orgId: org.id, key: "plans" } },
    data: { draft, published, publishedAt: published ? new Date() : doc.publishedAt },
  });

  const counts = (draft.plans || []).filter((p: any) => p.detail).length;
  console.log(`Merged detail into ${counts}/${draft.plans?.length} plans for org ${org.name}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
