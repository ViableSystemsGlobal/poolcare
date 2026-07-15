/**
 * Merge the remaining homepage sections (Trust, Services, How-it-works, Gallery,
 * Reviews, FAQ, App Download, Quote) into the "page.home" doc. Idempotent:
 * only adds a section if it's not already present.
 *
 * Run: cd packages/db && DATABASE_URL=... DEFAULT_ORG_ID=... npx tsx prisma/seed-home-sections.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SECTIONS: Record<string, any> = {
  trust: {
    stats: [
      { eyebrow: "Based in", big: "Accra", sub: "Mempeasem, Ghana" },
      { eyebrow: "Service plans", big: "4", sub: "Flex to Luxury Villa" },
      { eyebrow: "VIP response", big: "12h", sub: "Luxury Villa priority" },
      { eyebrow: "Cities served", big: "3", sub: "Accra · Kumasi · Takoradi" },
    ],
  },
  services: {
    eyebrow: "Services", title: "Complete pool care,", titleAccent: "managed", titleEnd: " with precision.",
    lead: "Every pool is assessed, assigned a service structure, and managed through a system that ensures consistency, accountability and control.",
    items: [
      { n: "01", label: "Routine maintenance", title: "Consistent cleaning,\nstructured every visit.", blurb: "Consistent cleaning and surface care carried out through a structured service process to maintain clarity and hygiene.", bullets: ["Defined visit checklist", "Skim, brush, vacuum, basket-empty", "Digital service log per visit"], bg: "linear-gradient(160deg, #1a3d2a 0%, #2d6248 60%, #5da37c 100%)", image: "/images/service-routine.webp" },
      { n: "02", label: "Water chemistry", title: "Balanced water,\ntested and dosed.", blurb: "Accurate water testing and controlled chemical dosing to maintain balanced conditions and prevent long-term damage.", bullets: ["Tested to 7 chemistry markers", "Controlled dosing log", "Monthly flocculant on Premium+"], bg: "linear-gradient(160deg, #233f2c 0%, #3b6b4b 60%, #88ab8e 100%)", image: "/images/service-chemistry.webp" },
      { n: "03", label: "Filtration & system", title: "Circulation,\ncontinuously protected.", blurb: "Monitoring of circulation, filtration, and system performance to ensure efficient operation and prevent strain on equipment.", bullets: ["Filter cleans on schedule", "Pump & circulation checks", "Performance reporting"], bg: "linear-gradient(160deg, #0d2419 0%, #1a3d2a 60%, #397d54 100%)", image: "/images/service-filtration.webp" },
      { n: "04", label: "Equipment monitoring", title: "Issues flagged\nbefore they break.", blurb: "Continuous inspection and digital reporting of equipment condition to detect issues early and maintain system reliability.", bullets: ["Preventive equipment checks", "Issue flagging in-app", "Photo + reading reports"], bg: "linear-gradient(160deg, #1a3d2a 0%, #4a7359 60%, #c4d4b8 100%)", image: "/images/service-monitoring.webp" },
    ],
  },
  howItWorks: {
    eyebrow: "How we work", title: "A structured approach", titleAccent: "to pool", titleEnd: " management.",
    lead: "We eliminate guesswork. Every pool is assessed, assigned a service structure, and managed through a system that ensures consistency and accountability.",
    steps: [
      { n: "01", title: "Assessment & evaluation", blurb: "We assess your pool size, usage and system condition to determine the right management approach for your property.", detail: "Pool size · usage · system condition" },
      { n: "02", title: "Service plan assignment", blurb: "Your pool is enrolled into a structured plan based on its specific requirements — Flex, Premium, Premium Plus or Luxury Villa.", detail: "Flex · Premium · Premium Plus · Luxury Villa" },
      { n: "03", title: "System-based servicing", blurb: "Every visit follows a defined process: water testing, equipment checks, surface care and documented actions — executed by trained technicians.", detail: "Testing · equipment checks · documented" },
      { n: "04", title: "Monitoring & reporting", blurb: "All service activity is tracked, reviewed and accessible through the PoolCare system — so you always know your pool's condition.", detail: "Tracked in the PoolCare app" },
    ],
  },
  gallery: {
    eyebrow: "Before & after", title: "Pools we've brought", titleAccent: "back into balance.",
    lead: "Beyond routine plans, PoolCare handles corrective and specialized work. Drag the slider to see the difference.",
    pairs: [
      { id: "green-restoration", title: "Green pool restoration", sub: "Real PoolCare project", before: "/images/gallery-green-before.webp", after: "/images/gallery-green-after.webp", beforeBg: "linear-gradient(135deg,#5d6f3a,#3d5530)", afterBg: "linear-gradient(135deg,#cfe5ef,#3c8bb0)" },
      { id: "pool-restoration", title: "Pool restoration & finishing", sub: "Real PoolCare project", before: "/images/gallery-restoration-before.webp", after: "/images/gallery-restoration-after.webp", beforeBg: "linear-gradient(135deg,#9aa28a,#6e7960)", afterBg: "linear-gradient(135deg,#0d2419,#1a3d2a)" },
      { id: "algae-recovery", title: "Emergency algae recovery", sub: "Real PoolCare project", before: "/images/gallery-algae-before.webp", after: "/images/gallery-algae-after.webp", beforeBg: "linear-gradient(135deg,#5d6f3a,#3d5530)", afterBg: "linear-gradient(135deg,#cfe5ef,#3c8bb0)" },
    ],
  },
  reviews: {
    eyebrow: "What clients say", title: "Trusted across", titleAccent: "Accra,", titleEnd: "one structured system.",
    lead: "From luxury villas to gated communities and guest houses—here's what our clients say about a pool, smartly managed.",
    items: [
      { quote: "We fully trust PoolCare. Their structured servicing and water management keep our pool clear and running smoothly.", name: "John D", role: "Pool Owner", avatarBg: "linear-gradient(135deg,#29c0e0,#1a3d2a)", initials: "JD" },
      { quote: "Since partnering with PoolCare, maintaining our pool has been simple. Their team provides reliable service and consistent quality every week.", name: "Faustina Bossman", role: "Villa Owner", avatarBg: "linear-gradient(135deg,#e6d5ae,#a88a55)", initials: "FB" },
      { quote: "We trust PoolCare completely. Their structured servicing and water management system keeps our pool clear and smoothly.", name: "Daniel Agyeman", role: "Pool Owner", avatarBg: "linear-gradient(135deg,#7adcef,#1a3d2a)", initials: "DA" },
      { quote: "Since working with PoolCare, our pool maintenance has been effortless. The team delivers dependable service and excellent quality every week.", name: "Roda Appiah", role: "Pool Owner", avatarBg: "linear-gradient(135deg,#f6d8c4,#c98567)", initials: "RA" },
    ],
  },
  faq: {
    eyebrow: "FAQ", titlePre: "Common", titleAccent: "questions,", titleEnd: "direct answers.",
    contactPhone: "(+233) 50 622 6222", contactEmail: "info@poolcare.africa",
    items: [
      { q: "What makes PoolCare different?", a: "PoolCare is a pool governance system, not just a cleaning service. Every visit follows a defined process — water testing, equipment checks, surface care and documented actions — and all service activity is tracked through the PoolCare app." },
      { q: "How do I choose between Flex, Premium, Premium Plus and Luxury Villa?", a: "Every pool is assessed before a plan is assigned — we evaluate pool size, usage and system condition. Flex is service-only maintenance where you supply chemicals; Premium adds full water chemistry management for pools up to 60 m³; Premium Plus adds equipment and performance care for 60–120 m³ pools; Luxury Villa is elite water management for large villas and estates of 60 m³ and above." },
      { q: "What is included in the monthly service?", a: "Every plan includes structured servicing, water testing, equipment monitoring and digital service reports in the app. Premium, Premium Plus and Luxury Villa also include treatment chemicals; on Flex you supply your own. Corrective and specialized work — such as green pool restoration, pump replacement or leak detection — is quoted separately." },
      { q: "How quickly do you respond to issues?", a: "Response time depends on your plan. Flex and Premium include a 48-hour response for non-emergency technical issues; Premium Plus has a 24–36 hour priority response; Luxury Villa carries VIP priority with a target response within 12 working hours. Emergencies are assessed separately." },
      { q: "Do you service salt-water pools?", a: "Yes. Our Premium Plus plan is built for salt chlorination and automated dosing systems, and includes salt cell inspection and calibration as part of its advanced care." },
      { q: "Can you manage commercial and hospitality pools?", a: "Yes. PoolCare is designed for pools that require structure and reliability — including luxury homes and villas, gated communities, guest houses and hospitality properties." },
      { q: "Where do you operate?", a: "PoolCare provides pool maintenance and water management across Accra and nearby communities — including East Legon, Cantonments, Trasacco and Spintex — and also serves Kumasi and Takoradi." },
    ],
  },
  appDownload: {
    eyebrow: "The PoolCare app", title: "Every pool, in", titleAccent: "one connected system.",
    lead: "Pool, technicians and management connected as one system — every service tracked, verified, and executed with precision.",
    ctaTitle: "Get the PoolCare app", ctaSub: "Free for every customer. iOS & Android.",
    items: [
      { n: "01", label: "Your dashboard", title: "Every pool,\non one dashboard.", blurb: "See all your pools, your balance and any upcoming visits the moment you open the app — with one-tap access to request a service or chat with your technician.", bullets: ["All your pools at a glance", "Balance & billing up front", "Request or chat in a tap"], bg: "linear-gradient(160deg, #1a3d2a 0%, #2d6248 70%, #5da37c 100%)", surface: "var(--paper)", shot: "/images/app-dashboard.webp" },
      { n: "02", label: "Book in seconds", title: "Book a visit,\nfrom your phone.", blurb: "Pick the pool, choose what you need — routine visit, repair, emergency or a cleaning issue — then set your preferred date and time. Confirm in a tap.", bullets: ["Routine, repair or emergency", "Choose your date & time", "Confirm the request instantly"], bg: "linear-gradient(160deg, #233f2c 0%, #3b6b4b 70%, #88ab8e 100%)", surface: "#fff", shot: "/images/app-book.webp" },
      { n: "03", label: "Service records", title: "Every visit,\nkept on record.", blurb: "Each pool keeps its own maintenance history. Service reports appear after every visit, so you always have a clear, dated record of the work done.", bullets: ["Maintenance history per pool", "Service reports after each visit", "Book service or request help"], bg: "linear-gradient(160deg, #0d2419 0%, #1a3d2a 60%, #397d54 100%)", surface: "var(--surface)", shot: "/images/app-history.webp" },
      { n: "04", label: "Account & family", title: "Bring everyone\nwho needs access.", blurb: "Manage billing, plans and payment in one place — and share household access with family. Service reminders keep everyone in the loop.", bullets: ["Billing, plans & invoices", "Family & household sharing", "Service reminders"], bg: "linear-gradient(160deg, #1a3d2a 0%, #4a7359 70%, #c4d4b8 100%)", surface: "#fff", shot: "/images/app-account.webp" },
    ],
  },
  quote: {
    eyebrow: "Get a quote", title: "A tailored quote,", titleAccent: "straight to your inbox.",
    lead: "Tell us about your pool and how you'd like it managed. We'll email you a tailored quote — final pricing is confirmed after a free on-site assessment.",
    note: "Every pool is assessed before a plan is assigned — we evaluate size, usage and system condition to confirm the right level of care.",
    formHeading: "Your details", submitLabel: "Email me a quote",
    footnote: "We typically respond the same business day. No spam, no marketing list.",
  },
};

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  const doc = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key: "page.home" } } });
  if (!doc) throw new Error(`No "page.home" — run seed-page-home.ts first.`);

  const mergeInto = (obj: any) => {
    const next = { ...(obj || {}) };
    for (const [k, v] of Object.entries(SECTIONS)) if (next[k] === undefined) next[k] = v;
    return next;
  };
  const draft = mergeInto(doc.draft);
  const published = doc.published ? mergeInto(doc.published) : draft;

  await prisma.websiteContent.update({
    where: { orgId_key: { orgId: org.id, key: "page.home" } },
    data: { draft, published, publishedAt: new Date() },
  });
  console.log(`Merged ${Object.keys(SECTIONS).length} homepage sections into page.home for ${org.name}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
