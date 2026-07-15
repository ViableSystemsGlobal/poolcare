import React from "react";
import { SITE_URL } from "./seo";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

async function getContent(key: string): Promise<any | null> {
  try {
    const r = await fetch(`${API_BASE}/public/website/${key}`, { next: { revalidate: 60 } });
    return r.ok ? (await r.json()).content : null;
  } catch {
    return null;
  }
}

/** Renders a JSON-LD script block. AI engines + Google parse these for entities. */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe; no user-controlled HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * Organization + LocalBusiness graph for the whole site. Gives AI answer
 * engines the NAP (name/address/phone), the areas served, and social links so
 * PoolCare is citable for "pool service in Accra"-type queries. Pulls live
 * NAP from the editable contact doc, with sensible fallbacks.
 */
export async function organizationSchema() {
  const contact = await getContent("page.contact");
  const cd = contact?.contactDetails || {};
  const phone = (cd.phoneHref || "").replace(/^tel:/, "") || "+233506226222";
  const email = (cd.emailHref || "").replace(/^mailto:/, "") || "info@poolcare.africa";
  const office: string = cd.office || "44 Nii Obodaifio Street, Mempeasem, Accra";

  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness", "HomeAndConstructionBusiness"],
    "@id": `${SITE_URL}/#organization`,
    name: "PoolCare",
    url: SITE_URL,
    logo: `${SITE_URL}/images/logo.png`,
    image: `${SITE_URL}/images/logo.png`,
    description:
      "Structured pool maintenance and water management for Accra and across Ghana — routine servicing, water chemistry, equipment monitoring and restoration, run as a documented system.",
    email,
    telephone: phone,
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: office,
      addressLocality: "Accra",
      addressCountry: "GH",
    },
    areaServed: [
      "Accra", "East Legon", "Cantonments", "Trasacco", "Spintex",
      "Kumasi", "Takoradi",
    ].map((name) => ({ "@type": "City", name })),
    sameAs: [
      "https://www.instagram.com/poolcare.africa",
      "https://www.facebook.com/poolcare.africa",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: phone,
      email,
      contactType: "customer service",
      areaServed: "GH",
      availableLanguage: ["English"],
    },
  };
}

/** WebSite entity (helps engines understand the site as a whole). */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: "PoolCare",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/** FAQPage from the homepage FAQ items — high-value for AI answer extraction. */
export async function faqSchema() {
  const home = await getContent("page.home");
  const items: { q: string; a: string }[] = home?.faq?.items || [];
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
