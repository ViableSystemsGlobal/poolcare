'use client';
import { Nav } from "@/components/Nav";
import { PageHero } from "@/components/PageHero";
import { About } from "@/components/About";
import { Area } from "@/components/Area";
import { Footer } from "@/components/Footer";
import { useCmsContent, cmsBind } from "@/lib/cms";

// About / company page body (client). Hero + Team copy are CMS-driven (page.about).
const FALLBACK = {
  hero: {
    eyebrow: "About",
    title: "The team and system behind PoolCare.",
    subtitle: "The structured system, disciplined approach and trained technicians behind every PoolCare visit.",
    image: "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=2400&q=80&auto=format&fit=crop",
  },
  team: {
    eyebrow: "Team",
    title: "The people behind your pool",
    lead: "Meet the trained technicians who keep Accra's pools clear, balanced, and monitored. Full team profiles are on the way.",
  },
};

export default function AboutClient() {
  const { content, editMode } = useCmsContent("page.about", {});
  const hero = content?.hero || FALLBACK.hero;
  const team = content?.team || FALLBACK.team;
  const bind = (p: string) => cmsBind(editMode, "page.about", p);

  return (
    <>
      <Nav home="/" />
      <main>
        <PageHero eyebrow={hero.eyebrow} title={hero.title} subtitle={hero.subtitle} image={hero.image} />
        <About />

        {/* Team */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap" style={{ maxWidth: 760, textAlign: "center" }}>
            <span className="h-eyebrow" style={{ display: "block", marginBottom: 16 }} {...bind("team.eyebrow")}>{team.eyebrow}</span>
            <h2 className="display-2" style={{ margin: 0 }} {...bind("team.title")}>{team.title}</h2>
            <p className="h-lead" style={{ margin: "20px auto 0", maxWidth: "46ch" }} {...bind("team.lead")}>{team.lead}</p>
          </div>
        </section>

        <Area />
      </main>
      <Footer home="/" />
    </>
  );
}
