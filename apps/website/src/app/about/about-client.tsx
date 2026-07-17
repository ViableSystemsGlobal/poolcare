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
    image: "/images/service-routine.webp",
  },
  team: {
    eyebrow: "Team",
    title: "The people behind your pool",
    lead: "Trained technicians who keep Accra's pools clear, balanced and monitored — every one of them working to the same structured system.",
  },
};

// The standards every PoolCare technician works to — grounded in how the
// service actually runs (visit checklists, app check-in, documented reports).
const TEAM_STANDARDS = [
  {
    n: "01",
    t: "Trained & structured",
    d: "Every technician works to defined visit checklists — skim, brush, vacuum, test — the same disciplined routine at every pool.",
  },
  {
    n: "02",
    t: "Verified on site",
    d: "Technicians check in on location through the PoolCare app, so you always know who was at your pool and when.",
  },
  {
    n: "03",
    t: "Documented work",
    d: "Water readings and before & after photos are logged on every visit and delivered straight to your service history.",
  },
];

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
          <div className="wrap">
            <div style={{ maxWidth: 760, textAlign: "center", margin: "0 auto" }}>
              <span className="h-eyebrow" style={{ display: "block", marginBottom: 16 }} {...bind("team.eyebrow")}>{team.eyebrow}</span>
              <h2 className="display-2" style={{ margin: 0 }} {...bind("team.title")}>{team.title}</h2>
              <p className="h-lead" style={{ margin: "20px auto 0", maxWidth: "46ch" }} {...bind("team.lead")}>{team.lead}</p>
            </div>
            <div className="team-standards" style={{ marginTop: 56 }}>
              {TEAM_STANDARDS.map((s) => (
                <div key={s.n} className="team-standards__cell">
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ink-3)" }}>{s.n}</div>
                  <div style={{ marginTop: 14, fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 500, letterSpacing: "-0.02em" }}>{s.t}</div>
                  <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: "34ch" }}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Area />
      </main>
      <Footer home="/" />
    </>
  );
}
