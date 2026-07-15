'use client';
import { Nav } from "@/components/Nav";
import { PageHero } from "@/components/PageHero";
import { Booking } from "@/components/Booking";
import { Footer } from "@/components/Footer";
import { useCmsContent } from "@/lib/cms";

// Assessment page body (client). Hero is CMS-driven (page.assessment).
const FALLBACK = {
  hero: {
    eyebrow: "Get started",
    title: "Book your free pool assessment.",
    subtitle: "Tell us about your pool and our team will evaluate your system, water condition and service requirements — then recommend the right plan.",
    image: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=2400&q=80&auto=format&fit=crop",
  },
};

export default function AssessmentClient() {
  const { content } = useCmsContent("page.assessment", {});
  const hero = content?.hero || FALLBACK.hero;
  return (
    <>
      <Nav home="/" />
      <main>
        <PageHero eyebrow={hero.eyebrow} title={hero.title} subtitle={hero.subtitle} image={hero.image} />
        <Booking />
      </main>
      <Footer home="/" />
    </>
  );
}
