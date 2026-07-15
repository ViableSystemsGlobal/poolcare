/**
 * Seed the global "site" doc — Nav + Footer content shown on every page.
 * Idempotent: ADDS any missing nav/footer keys (e.g. the menu arrays) to an
 * existing doc without clobbering values that were already edited.
 * Run: cd packages/db && DATABASE_URL=... DEFAULT_ORG_ID=... npx tsx prisma/seed-site.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SITE = {
  nav: {
    logo: "/images/logo.png",
    ctaLabel: "Book a pool assessment",
    primary: [
      { label: "Services & Plans", href: "/services-plans" },
      { label: "Products", href: "/products" },
      { label: "PoolCare App", href: "/#app" },
      { label: "Resources", href: "#", menu: [
        { label: "Blog",         desc: "Pool care tips & guides", href: "/blog" },
        { label: "Case Studies", desc: "Real PoolCare projects",  href: "/case-studies" },
        { label: "Careers",      desc: "We’re hiring",            href: "/careers" },
        { label: "Get a quote",  desc: "Tailored quote by email", href: "/#quote" },
      ] },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
    plans: [
      { label: "All plans",    href: "/services-plans" },
      { label: "Flex",         href: "/flex" },
      { label: "Premium",      href: "/premium" },
      { label: "Premium Plus", href: "/premium-plus" },
      { label: "Luxury Villa", href: "/luxury-villa" },
    ],
  },
  footer: {
    logo: "/images/logo.png",
    headline: "Get your pool",
    headlineAccent: "smartly managed.",
    ctaPrimary: "Book a pool assessment",
    ctaSecondary: "Call (+233) 50 622 6222",
    description: "Professional pool maintenance, repair, and installation services for homes, apartments, and commercial properties.",
    addressLine1: "44 Nii Obodaifio Street",
    addressLine2: "Mempeasem, Accra",
    email: "info@poolcare.africa",
    phone: "(+233) 50 622 6222",
    copyright: "© 2026 Pool Care. All Rights Reserved.",
    columns: [
      { title: "Explore", items: [
        { label: "Home", href: "/" },
        { label: "Services & Plans", href: "/services-plans" },
        { label: "Products", href: "/products" },
        { label: "The App", href: "/#app" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ] },
      { title: "Plans", items: [
        { label: "Flex", href: "/flex" },
        { label: "Premium", href: "/premium" },
        { label: "Premium Plus", href: "/premium-plus" },
        { label: "Luxury Villa", href: "/luxury-villa" },
        { label: "Compare plans", href: "/services-plans" },
      ] },
      { title: "Services", items: [
        { label: "Routine maintenance", href: "/#services" },
        { label: "Water chemistry", href: "/#services" },
        { label: "Filtration & system", href: "/#services" },
        { label: "Equipment monitoring", href: "/#services" },
        { label: "Specialized services", href: "/#services" },
      ] },
      { title: "Legal", items: [
        { label: "Disclaimer", href: "/disclaimer" },
        { label: "Privacy Policy", href: "/privacy-policy" },
        { label: "Terms & Conditions", href: "/terms" },
      ] },
    ],
    social: [
      { label: "Facebook", href: "#" },
      { label: "Twitter", href: "#" },
      { label: "YouTube", href: "#" },
    ],
    legalLinks: [
      { label: "Disclaimer", href: "/disclaimer" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
};

// Fill in keys that are absent in `cur`, keeping any existing values.
function fillMissing(base: any, cur: any): any {
  const out = { ...(cur || {}) };
  for (const k of Object.keys(base)) if (out[k] === undefined) out[k] = base[k];
  return out;
}

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  const existing = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key: "site" } } });
  if (!existing) {
    await prisma.websiteContent.create({ data: { orgId: org.id, key: "site", draft: SITE as any, published: SITE as any, publishedAt: new Date() } });
    console.log("Seeded site (nav + footer + menus).");
    return;
  }

  // Merge the new menu keys into both draft and published, preserving edits.
  const merge = (doc: any) => {
    const d = doc || {};
    return { ...d, nav: fillMissing(SITE.nav, d.nav), footer: fillMissing(SITE.footer, d.footer) };
  };
  await prisma.websiteContent.update({
    where: { orgId_key: { orgId: org.id, key: "site" } },
    data: { draft: merge(existing.draft) as any, published: merge(existing.published) as any },
  });
  console.log("Updated site doc — added missing nav/footer menu keys.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
