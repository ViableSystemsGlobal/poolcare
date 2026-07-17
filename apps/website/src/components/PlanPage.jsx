'use client';
import React from 'react';
import { Footer } from './Footer';
import { Nav } from './Nav';
import { PageHero } from './PageHero';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — shared layout + data for the four plan detail pages.
// Content is CMS-driven (key "plans", per-plan `detail`); PLAN_DATA below is the
// bundled fallback used if the API is unreachable.

const PLAN_DATA = {
  'flex': {
    index: '01', name: 'Flex', href: '/flex',
    title: 'The Flex Package — professional maintenance, flexible chemical supply',
    tagline: 'Service-only maintenance. You supply the chemicals; we run the system.',
    image: 'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?w=2400&q=80&auto=format&fit=crop',
    idealFor: 'For clients who prefer to supply their own chemicals while receiving structured cleaning, system checks and water management guidance.',
    idealChips: [],
    response: '48-hour response for technical issues. Emergencies assessed separately.',
    groups: [
      { title: 'Pool cleaning', items: ['Surface skimming', 'Manual vacuuming', 'Wall brushing', 'Waterline cleaning'] },
      { title: 'Filtration & circulation', items: ['Skimmer basket cleaning', 'Pump basket cleaning', 'Filter backwashing', 'Pump operation inspection'] },
      { title: 'Water testing & advisory', items: ['pH testing', 'Free chlorine testing', 'Total alkalinity testing', 'Calcium hardness testing', 'Chemical dosing guidance'] },
      { title: 'Equipment monitoring', items: ['Visual pump inspection', 'Filter integrity check', 'Valve condition check', 'Pipework inspection', 'Early fault reporting'] },
      { title: 'Digital reporting', items: ['Digital service report after every visit', 'Service log history via PoolCare app', 'Maintenance recommendations logged'] },
    ],
    chemicals: { label: 'Chemicals — client supplied', note: 'You provide treatment chemicals; PoolCare handles structured servicing, testing and dosing guidance.', items: ['Chlorine', 'pH+ / pH−', 'Algaecides', 'Flocculants', 'Clarifiers'] },
  },
  'premium': {
    index: '02', name: 'Premium', href: '/premium',
    title: 'Premium Package — essential water stability, consistency & peace of mind',
    tagline: 'Stable water management for residential pools that need consistent care.',
    image: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=2400&q=80&auto=format&fit=crop',
    idealFor: 'Designed for residential pools that require consistent servicing, balanced water chemistry and routine system care.',
    idealChips: ['Small to mid-size pools (up to 60 m³)', 'Basic circulation systems', 'Low to moderate usage homes'],
    response: '48-hour non-emergency response.',
    groups: [
      { title: 'Cleaning services', items: ['Surface skimming', 'Manual vacuuming', 'Wall brushing', 'Skimmer & pump basket cleaning', 'Filter backwashing', 'Pump inspection'] },
      { title: 'Water management', items: ['pH, chlorine, alkalinity & total hardness testing', 'Chlorine dosing', 'pH adjustment included', 'Monthly routine flocculant treatment'] },
      { title: 'Reporting & service', items: ['Digital service report after each visit', 'App-based tracking', '48-hour non-emergency response'] },
    ],
    chemicals: { label: 'Chemicals — included', note: 'Treatment chemicals are included within your monthly plan.', items: ['Chlorine', 'pH+ / pH−', 'Flocculants'] },
  },
  'premium-plus': {
    index: '03', name: 'Premium Plus', href: '/premium-plus',
    title: 'Premium Plus Plan — managed water performance & equipment longevity',
    tagline: 'Performance and equipment care for active mid-to-large pools.',
    image: 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=2400&q=80&auto=format&fit=crop',
    idealFor: 'For pools requiring enhanced monitoring, proactive system care and improved water performance.',
    idealChips: ['Mid to large pools (60–120 m³)', 'Salt chlorination systems', 'Automated dosing systems', 'Moderate to high usage'],
    response: '24–36 hour priority response. Priority scheduling for technical issues.',
    groups: [
      { title: 'Everything in Premium', items: ['Surface skimming, manual vacuuming, wall brushing', 'Basket cleaning, filter backwashing, pump inspection', 'Full water testing', 'Digital service reports', 'App tracking'] },
      { title: 'Plus — advanced care', items: ['Salt cell inspection & calibration', 'Full water balance profiling', 'Bi-weekly algaecide dosing', 'Quarterly tile descaling', 'Equipment lubrication', 'Filter media inspection', 'One preventive equipment inspection monthly'] },
      { title: 'Reporting', items: ['Digital log per visit', 'App-based tracking', 'Monthly performance summary report'] },
    ],
    chemicals: { label: 'Chemicals — all included', note: 'All chemicals are included within the plan.', items: ['Chlorine / salt system management', 'pH control chemicals', 'Flocculants', 'Shock treatments', 'Algae remediation treatments', 'Scale & stain controllers', 'Clarifiers'] },
  },
  'luxury-villa': {
    index: '04', name: 'Luxury Villa', href: '/luxury-villa',
    title: 'Luxury Villa Plan — elite water management, prestige & asset protection',
    tagline: 'Complete water governance for high-end villas, estates and water features.',
    image: 'https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=2400&q=80&auto=format&fit=crop',
    idealFor: 'A structured management program for high-end properties where water clarity and system integrity must remain uncompromised.',
    idealChips: ['Large villas & estates (60 m³+)', 'Infinity & overflow pools', 'Properties with spas or water features', 'Diplomatic, executive & premium residences'],
    response: 'VIP priority — target response within 12 working hours.',
    groups: [
      { title: 'Everything in Premium Plus', items: ['All Premium Plus services', 'Full chemical management', 'Water balance profiling', 'Bi-weekly algaecide', 'Quarterly tile descaling', 'Equipment lubrication'] },
      { title: 'Advanced water chemistry', items: ['TDS monitoring', 'Calcium hardness management', 'Advanced water chemistry profiling', 'Overflow trough cleaning', 'UV / Ozone system inspection'] },
      { title: 'Elite equipment care', items: ['Heater system inspection', 'Quarterly equipment room audit', 'Annual full filter media change', 'Bi-annual tile line polishing', 'Weekly equipment diagnostics', 'Quarterly deep service'] },
      { title: 'Governance & reporting', items: ['App-based service management', 'Digital log per visit', 'Monthly performance analytics report', 'Annual water performance summary'] },
    ],
    chemicals: { label: 'Chemicals — fully managed', note: 'All water treatment chemicals are included within the structured management scope. No additional chemical costs — complete water governance.', items: ['Complete water treatment chemistry', 'Salt system management', 'Scale & stain control', 'Shock & algae remediation', 'Clarifiers & specialty treatments'] },
  },
};

const FALLBACK_PLANS = Object.entries(PLAN_DATA).map(([id, d]) => ({
  id, name: d.name, href: d.href, idealFor: d.idealFor,
  detail: { index: d.index, title: d.title, tagline: d.tagline, image: d.image, idealChips: d.idealChips, response: d.response, groups: d.groups, chemicals: d.chemicals },
}));

function PlanPage({ planKey, home = '/' }) {
  const { content, editMode } = useCmsContent('plans', { plans: FALLBACK_PLANS });
  const plans = content?.plans?.length ? content.plans : FALLBACK_PLANS;
  const idx = plans.findIndex((x) => (x.id || '') === planKey);
  const cms = idx >= 0 ? plans[idx] : null;
  const fb = PLAN_DATA[planKey] || {};
  const d = cms?.detail || {};

  const p = {
    index: d.index || fb.index,
    name: cms?.name || fb.name,
    href: cms?.href || fb.href,
    title: d.title || fb.title,
    tagline: d.tagline || fb.tagline,
    image: d.image || fb.image,
    idealFor: cms?.idealFor || fb.idealFor,
    idealChips: d.idealChips || fb.idealChips || [],
    response: d.response || fb.response,
    groups: d.groups || fb.groups || [],
    chemicals: d.chemicals || fb.chemicals || { label: '', note: '', items: [] },
  };
  if (!p.name) return null;

  const bindable = editMode && idx >= 0;
  const bind = (path) => (bindable ? cmsBind(true, 'plans', `plans.${idx}.${path}`) : {});

  const others = plans.filter((_, i) => i !== idx);

  return (
    <React.Fragment>
      <Nav home={home} />
      <main>
        <PageHero
          eyebrow={`Plan ${p.index} · ${p.name}`}
          title={p.title}
          subtitle={p.tagline}
          image={p.image}
        />

        <section className="section">
          <div className="wrap">
            <div className="r-grid-2-r" style={{ alignItems: 'start' }}>
              <div>
                <span className="h-eyebrow">Who it&rsquo;s for</span>
                <p className="h-lead" style={{ margin: '16px 0 0', maxWidth: '44ch' }} {...bind('idealFor')}>{p.idealFor}</p>
                {p.idealChips.length > 0 && (
                  <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }} {...bind('detail.idealChips')}>
                    {p.idealChips.map((c, i) => (
                      <span key={i} className="chip" style={{ height: 'auto', padding: '8px 14px', textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-sans)', fontSize: 13 }}>{c}</span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--ink)', color: '#fff', borderRadius: 24, padding: 36 }}>
                <div className="h-eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }}>Pricing</div>
                <div style={{ marginTop: 16, fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 2.6vw, 34px)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                  Tailored to your pool.
                </div>
                <div style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.6)' }}>
                  Your monthly price is confirmed after a free on-site assessment &mdash; based on your pool&rsquo;s size, system and usage.
                </div>
                <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 13.5, color: 'rgba(255,255,255,0.78)' }}>
                  <strong style={{ fontWeight: 500, color: '#fff' }}>Response:</strong> <span {...bind('detail.response')}>{p.response}</span>
                </div>
                <a className="btn btn-light" href="/assessment" style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}>Book a free assessment</a>
                <a href={home + '#quote'} style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Get a quote by email &rarr;</a>
              </div>
            </div>

            <div className="h-eyebrow" style={{ display: 'block', margin: '80px 0 24px' }}>What&rsquo;s included</div>
            <div className="r-grid-3">
              {p.groups.map((g, gi) => (
                <div key={gi} className="card" style={{ padding: 28 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 16 }} {...bind(`detail.groups.${gi}.title`)}>{g.title}</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {g.items.map((it, ii) => (
                      <li key={ii} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.45 }} {...bind(`detail.groups.${gi}.items.${ii}`)}>
                        <span style={{ width: 18, height: 18, borderRadius: 999, background: 'var(--accent)', flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="9" height="9" viewBox="0 0 11 11"><path d="M2.5 5.5L4.5 7.5L8.5 3.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: '28px 32px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 20 }}>
              <div className="h-eyebrow" style={{ marginBottom: 8 }} {...bind('detail.chemicals.label')}>{p.chemicals.label}</div>
              <p style={{ margin: '0 0 18px', fontSize: 15, color: 'var(--ink-2)', maxWidth: '60ch' }} {...bind('detail.chemicals.note')}>{p.chemicals.note}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} {...bind('detail.chemicals.items')}>
                {(p.chemicals.items || []).map((c, i) => (
                  <span key={i} style={{ padding: '7px 14px', border: '1px solid var(--line)', borderRadius: 999, fontSize: 13, color: 'var(--ink-2)', background: '#fff' }}>{c}</span>
                ))}
              </div>
            </div>

            <div className="h-eyebrow" style={{ display: 'block', margin: '72px 0 20px' }}>Other plans</div>
            <div className="r-grid-3">
              {others.map((op, i) => (
                <a key={i} href={op.href} className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, cursor: 'default' }}>
                  <span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Plan {op.detail?.index || ''}</div>
                    <div style={{ marginTop: 4, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em' }}>{op.name}</div>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 14 14"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer home={home} />
    </React.Fragment>
  );
}

export { PlanPage, PLAN_DATA };
