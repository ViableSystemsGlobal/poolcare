/**
 * Seed the Products showcase page (page.products) — PoolCare's own branded
 * chemical products, grouped by category. Showcase only (no prices/buying).
 * Content sourced from "PoolCare Product list-Website.docx"; images live in
 * apps/website/public/images/products/.
 * Run: cd packages/db && DATABASE_URL=... DEFAULT_ORG_ID=... npx tsx prisma/seed-products.ts
 * Existing content is kept unless FORCE=1 is set (FORCE overwrites draft + published).
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const IMG = (f: string) => `/images/products/${f}`;

const PRODUCTS = {
  seo: {
    title: "PoolCare Products — Branded Pool Chemicals",
    description: "Explore PoolCare's own line of professional pool chemicals — sanitisers, balancers, algaecides and clarifiers trusted by our technicians.",
    ogImage: "",
  },
  hero: {
    eyebrow: "Our Products",
    title: "PoolCare",
    titleAccent: "branded chemicals.",
    lead: "Our own line of professional pool chemicals — the same products our technicians trust on every visit. Built for Ghana's climate and water conditions.",
  },
  products: [
    // ── Sanitisers ─────────────────────────────────────────────────────────
    {
      name: "PoolCare® Super Shock",
      category: "Sanitisers",
      image: IMG("super-shock.png"),
      blurb: "Fast-acting calcium hypochlorite shock treatment.",
      description: "A premium-grade Calcium Hypochlorite (Cal-Hypo) shock treatment that rapidly sanitises pool water — eliminating bacteria, algae, organic contaminants and the chloramines that cause chlorine odour and cloudy water. Ideal for routine shocks, seasonal start-ups, algae remediation and emergency water recovery.",
      form: "Granular (Cal-Hypo, 70% available chlorine)",
      dosage: "100–150 g per 10m³ routine; 200–300 g per 10m³ for heavy contamination or algae. Pre-dissolve, dose in the evening, keep the pump running 8+ hours.",
      benefits: [
        "Rapidly destroys bacteria, viruses and algae",
        "Eliminates chloramine odour and restores clarity",
        "Oxidises body oils, cosmetics and perspiration",
        "Fast dissolving — routine and emergency shocks",
      ],
      safety: "Powerful oxidiser — never mix with acids, ammonia or other chemicals. Pre-dissolve in water (never water into product) and keep swimmers out until free chlorine returns to 1–3 ppm.",
    },
    {
      name: "PoolCare® Chlorine Classic Tablets & Granules",
      category: "Sanitisers",
      image: IMG("chlorine-classic.png"),
      blurb: "Stabilised ~90% chlorine for continuous sanitisation.",
      description: "Premium stabilised chlorine (TCCA) with approximately 90% available chlorine for long-lasting disinfection. Slow-dissolving and UV-stabilised, it keeps a steady chlorine residual in outdoor pools via automatic chlorinators, floating dispensers or the skimmer basket.",
      form: "3″ tablets & granules (stabilised TCCA, ~90% available chlorine)",
      dosage: "Approx. 25 g per 10m³ daily to hold 1–3 ppm free chlorine; adjust to test results. Weekly shock with PoolCare® Super Shock.",
      benefits: [
        "Slow-dissolving for continuous chlorine release",
        "UV-stabilised — ideal for outdoor pools",
        "Works in chlorinators, floaters and skimmers",
        "Keeps water crystal-clear and hygienic",
      ],
      safety: "Strong oxidiser — never mix with acids, ammonia, calcium hypochlorite or other chemicals. Never place tablets directly on liners or painted surfaces. Monitor stabiliser (30–100 ppm) and dilute if excessive.",
    },
    {
      name: "PoolCare® Chlorine Multifunction Tablets & Granules",
      category: "Sanitisers",
      image: IMG("chlorine-multifunction.png"),
      blurb: "5-in-1 chlorine: sanitises, fights algae and clarifies.",
      description: "Combines powerful chlorination (87% available chlorine) with copper sulphate algae control and aluminium sulphate clarification — sanitising, controlling algae, clarifying water, improving filtration and reducing staining in one slow-dissolving product.",
      form: "3″ tablets & granules (87% chlorine + 1.5% copper sulphate + 1.5% aluminium sulphate)",
      dosage: "Approx. 25 g per 10m³ daily to hold 1–3 ppm free chlorine; increase in hot weather or heavy use. Weekly shock with PoolCare® Super Shock.",
      benefits: [
        "Five treatments in one tablet",
        "Built-in algae control with copper sulphate",
        "Clarifies water and improves filtration",
        "Slow-dissolving, UV-stabilised protection",
      ],
      safety: "Strong oxidiser — never mix with acids, ammonia or other pool chemicals. Never place tablets directly on pool surfaces. Monitor cyanuric acid (30–100 ppm).",
    },
    {
      name: "PoolCare® TCCA 2g Instant Tablets",
      category: "Sanitisers",
      image: IMG("tcca-instant-tablets.png"),
      blurb: "Fast-dissolving 2 g tablets for rapid chlorine recovery.",
      description: "Fast-acting stabilised chlorine tablets (50% available chlorine) that dissolve fully in about 15 minutes — for quick chlorine adjustments, heavy bather loads and emergency treatment, with built-in stabiliser to protect chlorine from sunlight.",
      form: "2 g instant tablets (TCCA, 50% available chlorine, dissolves in ~15 min)",
      dosage: "Distribute evenly with the pump running (or via floating dispenser); re-test and repeat only as needed to hold 1–3 ppm free chlorine.",
      benefits: [
        "Dissolves within ~15 minutes",
        "Rapid chlorine residual recovery",
        "UV-stabilised for outdoor pools",
        "Works in soft and hard water, all filter systems",
      ],
      safety: "Strong oxidiser — never mix with acids, ammonia, calcium hypochlorite or other chemicals. Do not place tablets directly on vinyl liners or painted surfaces.",
    },

    // ── Balancers ──────────────────────────────────────────────────────────
    {
      name: "PoolCare® pH Plus & pH Minus",
      category: "Balancers",
      image: IMG("ph-plus-minus.png"),
      blurb: "Professional pH balance — raise or lower to 7.2–7.6.",
      description: "Professional-grade water balance chemicals that keep pool and spa water in the ideal 7.2–7.6 pH range. pH Plus raises low pH; pH Minus lowers high pH — protecting swimmer comfort, sanitiser efficiency, equipment and finishes.",
      form: "Granular — pre-dissolve in a bucket of pool water",
      dosage: "pH Plus: 10–20 g per 1m³ raises pH ~0.1. pH Minus: 100 g per 10m³ lowers pH ~0.1–0.2. Dose with the pump running, re-test after 4–6 hours.",
      benefits: [
        "Keeps chlorine working efficiently",
        "Prevents eye and skin irritation",
        "Protects equipment from corrosion and scale",
        "Keeps water sparkling clear",
      ],
      safety: "Always add chemical to water — never water to chemical. Never mix with chlorine products or other chemicals. Wear gloves and eye protection.",
    },

    // ── Clarifiers & Flocculants ───────────────────────────────────────────
    {
      name: "PoolCare® WaterClear (PAC Clarifier)",
      category: "Clarifiers & Flocculants",
      image: IMG("waterclear-pac.png"),
      blurb: "Advanced PAC flocculant for crystal-clear water.",
      description: "A premium Polyaluminium Chloride (PAC) clarifier and flocculant that coagulates fine dirt, organic matter and microscopic impurities into filterable flocs — restoring sparkling water and improving filtration efficiency.",
      form: "Spray-dried PAC powder (~30% Al₂O₃, drinking-water treatment grade)",
      dosage: "100–200 mL per 10m³ routine (diluted 1:10, dosed via skimmer); up to 300 mL per 10m³ for heavy cloudiness, settled overnight and vacuumed to waste.",
      benefits: [
        "Rapidly clears cloudy pool water",
        "Removes particles ordinary filtration misses",
        "Improves filter performance and reduces filtration time",
        "Compatible with most sand filter systems",
      ],
      safety: "Do not mix directly with other pool chemicals. Wear gloves and eye protection when handling concentrate. Always add product to water.",
    },
    {
      name: "PoolCare® Alum Flocculant",
      category: "Clarifiers & Flocculants",
      image: IMG("alum-flocculant.png"),
      blurb: "Aluminium sulphate floc for heavily clouded pools.",
      description: "A premium-grade Aluminium Sulphate flocculant that binds suspended particles, fine debris and dead algae into dense flocs which settle to the pool floor for vacuuming to waste — ideal after algae treatment, storms or heavy bather loads.",
      form: "Granules / crystals (water treatment grade, min 16–17% Al₂O₃)",
      dosage: "100–200 g per 10m³ routine; 300–500 g per 10m³ for heavy cloudiness. Adjust pH to 7.0–7.4 first, settle 8–12 hours with the pump off, then vacuum to waste.",
      benefits: [
        "Clears severe cloudiness filtration can't fix",
        "Removes dead algae after shock treatment",
        "Reduces filter loading during major clean-ups",
        "Works in residential and commercial pools",
      ],
      safety: "Acidic — avoid dust, wear gloves and eye protection. Do not mix with chlorine products. Vacuum settled floc to waste, not through the filter.",
    },
    {
      name: "PoolCare® Super Active Clarifying Gel",
      category: "Clarifiers & Flocculants",
      image: IMG("clarifying-gel.png"),
      blurb: "Mess-free gel pouch that polishes water all week.",
      description: "A highly concentrated gel clarifier whose advanced flocculating technology binds microscopic particles, dust, pollen and algae spores into filterable clumps. The gel format gives a clean, controlled-release application with long-lasting clarification.",
      form: "Concentrated gel pouch — controlled release",
      dosage: "One pouch per week for routine water polishing; see label for pool volume guidance.",
      benefits: [
        "Rapidly clears cloudy water",
        "Traps algae spores before they develop",
        "Clean, mess-free application",
        "Works with sand, cartridge and DE filters",
      ],
      safety: "Keep out of reach of children. Do not mix with other pool chemicals.",
    },

    // ── Algaecides ─────────────────────────────────────────────────────────
    {
      name: "PoolCare® AlgaeClear",
      category: "Algaecides",
      image: IMG("algaeclear.png"),
      blurb: "Prevents and eliminates green, black and mustard algae.",
      description: "A professional-grade algaecide that destroys existing algae and provides long-lasting protection against regrowth. Use weekly for prevention, or after a shock treatment to clear established green, black or mustard algae.",
      form: "Liquid (clear to light blue)",
      dosage: "Prevention: 10–20 mL per 10m³ weekly. Treatment: brush, shock with Super Shock, then 30–50 mL per 10m³ after ~24 hours with the pump running.",
      benefits: [
        "Controls green, black and mustard algae",
        "Long-lasting preventive protection",
        "Compatible with chlorine and bromine systems",
        "Restores crystal-clear water",
      ],
      safety: "Add separately from other pool chemicals with the pump running. Wear gloves and eye protection when handling concentrate.",
    },

    // ── Specialty Cleaners (BOWS) ──────────────────────────────────────────
    {
      name: "BOWS Grease Stain & Scale Cleaner",
      category: "Specialty Cleaners",
      image: IMG("bows-grease-stain-scale-cleaner.png"),
      blurb: "Scrub formula for grease, scale, calcium and rust stains.",
      description: "A professional-strength scrub cleaner that removes stubborn grease, body oils, hard-water scale, calcium deposits, rust and metal discoloration from pool and spa surfaces — restoring stained, dull finishes without damage when used as directed.",
      size: "500 g · 1 kg · 5 kg",
      form: "Scrub compound — apply with sponge, brush or pad",
      dosage: "Wet the surface, scrub with a small amount on a damp sponge or soft brush, let sit 2–5 minutes on stubborn stains (don't let it dry), then rinse thoroughly.",
      benefits: [
        "Removes grease, body oils and waterline scum",
        "Eliminates calcium scale and mineral deposits",
        "Cleans rust and metal stains",
        "Safe on concrete, tile and fiberglass (spot-test vinyl)",
      ],
      safety: "Wear gloves and eye protection. Do not mix with chlorine, acids, ammonia or other cleaners. Test on a small hidden area before cleaning delicate finishes.",
    },
    {
      name: "BOWS Enzyme Clarifier",
      category: "Specialty Cleaners",
      image: IMG("bows-enzyme-clarifier.png"),
      blurb: "Natural enzymes digest oils, lotions and organic waste.",
      description: "A premium enzyme-based treatment that digests body oils, sunscreen, cosmetics, sweat and other organic waste at the source — clearing cloudy water, preventing waterline scum and lowering chlorine demand, without affecting pH or water balance.",
      size: "5 L",
      form: "Liquid — natural enzyme technology",
      dosage: "Initial: ~240 mL per 38m³. Weekly maintenance: ~120 mL per 38m³, poured around the pool with the pump running for 8+ hours. Not within 24 h of shock chlorination.",
      benefits: [
        "Digests oils and organic waste at the source",
        "Eliminates waterline scum and greasy films",
        "Reduces chlorine demand",
        "Doesn't alter pH or water balance",
      ],
      safety: "Do not use within 24 hours before or after shock chlorination — high chlorine deactivates the enzymes. Add separately from other chemicals.",
    },
    {
      name: "BOWS Clarifier & Oil Remover 2-in-1",
      category: "Specialty Cleaners",
      image: IMG("bows-clarifier-oil-remover.png"),
      blurb: "Dual action: strips oils and clarifies cloudy water.",
      description: "A dual-action treatment that breaks down body oils, sunscreen and cosmetic residues while coagulating fine suspended particles for the filter to capture — restoring clarity in heavily used pools where oils and debris build up fast.",
      size: "1 L",
      form: "Liquid",
      dosage: "With pH at 7.2–7.6, dose around the perimeter or into the skimmer and filter for 6–8 hours; for heavy contamination use a higher dose and filter 12–24 hours.",
      benefits: [
        "Cleans and clarifies in one application",
        "Removes oils sanitisers can't eliminate",
        "Reduces waterline scum and oily films",
        "Works in freshwater and saltwater pools",
      ],
      safety: "Do not mix directly with other pool chemicals — add each separately with the circulation running.",
    },
    {
      name: "BOWS Metal Control",
      category: "Specialty Cleaners",
      image: IMG("bows-metal-control.png"),
      blurb: "Sequesters iron, copper and manganese to stop stains.",
      description: "A premium metal sequestrant that binds dissolved iron, copper, manganese and trace minerals so they can't react with chlorine to stain surfaces or discolour water — essential for pools filled with borehole, well or mineral-rich water.",
      size: "500 mL · 1 L · 5 L · 20 L",
      form: "Liquid sequestrant",
      dosage: "Initial dose with pH at 7.2–7.6 and the pump running 6–8 hours; avoid shocking for 24 hours after. Maintenance dose every 2–4 weeks or after topping up with fresh water.",
      benefits: [
        "Prevents brown, green and blue-green metal stains",
        "Stops water turning tea-coloured after chlorination",
        "Protects finishes, heaters, pumps and filters from scale",
        "Compatible with chlorine, bromine, salt, UV and ozone systems",
      ],
      safety: "Do not mix directly with other pool chemicals. Wear gloves and eye protection when handling.",
    },
    {
      name: "BOWS Urea Remover",
      category: "Specialty Cleaners",
      image: IMG("bows-urea-remover.png"),
      blurb: "Eliminates urea so chlorine works harder, smells less.",
      description: "A specialised treatment that breaks down urea and nitrogen-based contaminants introduced by perspiration — restoring chlorine efficiency, cutting chloramine formation, and eliminating the strong 'chlorine smell' and eye irritation in high-bather-load pools.",
      size: "1 kg",
      form: "Water treatment powder",
      dosage: "Dose evenly with the pump running and filter 6–8 hours (12–24 hours for high urea levels), then re-test and adjust sanitiser.",
      benefits: [
        "Restores chlorine efficiency",
        "Reduces chloramine odour and eye irritation",
        "Ideal after pool parties and heavy use",
        "Compatible with chlorine, bromine, salt, UV and ozone systems",
      ],
      safety: "Do not mix directly with other pool chemicals — add separately with the circulation system operating.",
    },

    // ── Equipment ──────────────────────────────────────────────────────────
    {
      name: "Seauto Advanced Pool Robotic Cleaner",
      category: "Equipment",
      image: IMG("seauto-robotic-cleaner.jpeg"),
      blurb: "Cordless robot that cleans floor, walls and waterline.",
      description: "A high-performance cordless robotic cleaner with intelligent 3D navigation that maps the pool and follows an optimised path — automatically cleaning the floor, walls and waterline at the press of a button, with up to 90 minutes of runtime per charge.",
      form: "Cordless robotic cleaner — rechargeable lithium battery",
      dosage: "Run 2–3 times per week for residential pools; rinse the filter basket after every use.",
      benefits: [
        "3D navigation for full-coverage cleaning",
        "Cleans floor, walls and waterline automatically",
        "Cordless — no tangled cables",
        "Up to 90 minutes per charge, one-touch operation",
      ],
      safety: "Do not operate while swimmers are in the pool. Use only the supplied charger and keep it away from water.",
    },
  ],
};

async function main() {
  const pinned = process.env.DEFAULT_ORG_ID;
  const org = pinned
    ? await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!org) throw new Error("No organization found");

  const existing = await prisma.websiteContent.findUnique({ where: { orgId_key: { orgId: org.id, key: "page.products" } } });
  if (existing && !process.env.FORCE) { console.log("page.products already exists — skipped (set FORCE=1 to overwrite)."); return; }
  await prisma.websiteContent.upsert({
    where: { orgId_key: { orgId: org.id, key: "page.products" } },
    create: { orgId: org.id, key: "page.products", draft: PRODUCTS as any, published: PRODUCTS as any, publishedAt: new Date() },
    update: { draft: PRODUCTS as any, published: PRODUCTS as any, publishedAt: new Date() },
  });
  console.log(`Seeded page.products (${PRODUCTS.products.length} products).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
