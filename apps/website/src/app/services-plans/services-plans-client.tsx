'use client';
import { Nav } from "@/components/Nav";
import { PageHero } from "@/components/PageHero";
import { Services } from "@/components/Services";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";
import { useCmsContent } from "@/lib/cms";

// Combined Services + Plans page body (client). Hero is CMS-driven (page.services-plans).
const FALLBACK = {
  hero: {
    eyebrow: "Services & Plans",
    title: "Complete pool care, on a plan that fits.",
    subtitle: "Every service we run and the four management plans they map to — from service-only maintenance to fully managed water systems.",
    image: "https://images.unsplash.com/photo-1572331165267-854da2b10ccc?w=2400&q=80&auto=format&fit=crop",
  },
};

export default function ServicesPlansClient() {
  const { content } = useCmsContent("page.services-plans", {});
  const hero = content?.hero || FALLBACK.hero;
  return (
    <>
      <Nav home="/" />
      <main>
        <PageHero eyebrow={hero.eyebrow} title={hero.title} subtitle={hero.subtitle} image={hero.image} />
        <Services />
        <Pricing />
      </main>
      <Footer home="/" />
    </>
  );
}
