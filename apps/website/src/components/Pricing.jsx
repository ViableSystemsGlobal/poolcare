'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Plans as full-width detail rows (no price ranges — pricing is
// confirmed after a free on-site assessment) with an assessment CTA panel at
// the bottom. Content is CMS-driven (key "plans"); these values are the
// bundled fallback used if the API is unreachable, and the day-one seed.
const FALLBACK = {
  section: {
    eyebrow: 'Plans',
    title: 'Choose the level of management your pool needs.',
    lead: 'Four plans, tuned to the complexity of your system and the level of control you expect — from service-only maintenance to fully managed water systems.',
    ctaEyebrow: 'Get started',
    ctaTitle: 'Not sure which plan fits?',
    ctaLead: 'Book a free on-site assessment — we inspect your pool and equipment, then recommend the right plan and confirm your pricing. No obligation.',
  },
  plans: [
    { id: 'flex', name: 'Flex', href: '/flex', tag: 'Service-only maintenance', blurb: 'For clients who prefer to supply their own chemicals while receiving structured cleaning, system checks and water management guidance.', idealFor: 'Any pool · client-supplied chemicals', cta: 'Flex plan details', features: ['Routine cleaning and servicings', 'Water testing and dosing guidance', 'Equipment inspection and reporting', 'Digital service logs'], badges: ['Service-only', '48h response'], featured: false },
    { id: 'premium', name: 'Premium', href: '/premium', tag: 'Stable water management', blurb: 'Designed for residential pools that require consistent servicing, balanced water chemistry and routine system care.', idealFor: 'Pools up to 60 m³', cta: 'Premium plan details', features: ['Routine pool maintenance', 'Water testing and chemical balancing', 'Monthly flocculant treatment', 'App-based service tracking'], badges: ['Chemicals included', '48h response'], featured: false },
    { id: 'premium-plus', name: 'Premium Plus', href: '/premium-plus', tag: 'Performance & equipment care', blurb: 'For pools requiring enhanced monitoring, proactive system care and improved water performance.', idealFor: 'Pools 60–120 m³', cta: 'Premium Plus details', features: ['Everything in Premium', 'Advanced water profiling', 'Preventive equipment checks', 'Algaecide and shock treatments'], badges: ['Chemicals included', '24–36h priority'], featured: true },
    { id: 'luxury-villa', name: 'Luxury Villa', href: '/luxury-villa', tag: 'Elite water management', blurb: 'A structured management program for high-end properties where water clarity and system integrity must remain uncompromised.', idealFor: 'Large villas & estates · 60 m³+', cta: 'Luxury Villa details', features: ['Full water chemistry management', 'Advanced system diagnostics', 'Priority response scheduling', 'Monthly performance reporting'], badges: ['VIP priority', '12h target'], featured: false },
  ],
};

function Pricing() {
  const { content, editMode } = useCmsContent('plans', FALLBACK);
  const section = { ...FALLBACK.section, ...(content?.section || {}) };
  const plans = content?.plans || FALLBACK.plans;
  const bind = (path) => cmsBind(editMode, 'plans', path);

  return (
    <section className="section" style={{ background: 'var(--paper)' }} id="pricing">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="h-eyebrow" {...bind('section.eyebrow')}>{section.eyebrow}</span>
            <h2 className="display-2 section-head__title" style={{ marginTop: 16 }} {...bind('section.title')}>
              {section.title}
            </h2>
          </div>
          <p className="h-lead section-head__lead" {...bind('section.lead')}>
            {section.lead}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {plans.map((p, i) => <PlanRow key={p.id || i} plan={p} bind={bind} index={i} total={plans.length} />)}
        </div>

        {/* Bottom call to action — pricing is confirmed at the assessment */}
        <div style={{
          marginTop: 48,
          background: 'var(--ink)', color: '#fff',
          borderRadius: 32,
          padding: 'clamp(36px, 5vw, 64px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 32, flexWrap: 'wrap',
        }}>
          <div style={{ maxWidth: 560 }}>
            <span className="h-eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }} {...bind('section.ctaEyebrow')}>{section.ctaEyebrow}</span>
            <h3 className="display-2" style={{ margin: '14px 0 0', color: '#fff' }} {...bind('section.ctaTitle')}>{section.ctaTitle}</h3>
            <p className="h-lead" style={{ marginTop: 16, color: 'rgba(255,255,255,0.7)' }} {...bind('section.ctaLead')}>
              {section.ctaLead}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn btn-lg" href="/assessment" style={{ background: '#fff', color: 'var(--ink)' }}>
              Book a free assessment
              <svg width="13" height="13" viewBox="0 0 14 14"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
            <a className="btn btn-lg" href="/#quote" style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
              Get a quote by email
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanRow({ plan, bind, index, total }) {
  const featured = plan.featured ?? plan.feature;
  const badges = plan.badges || plan.notable || [];
  const p = (field) => `plans.${index}.${field}`;
  const ink = featured ? '#fff' : 'var(--ink)';
  const muted = featured ? 'rgba(255,255,255,0.65)' : 'var(--ink-3)';
  const body = featured ? 'rgba(255,255,255,0.8)' : 'var(--ink-2)';
  const hairline = featured ? 'rgba(255,255,255,0.15)' : 'var(--line)';
  return (
    <article className="plan-row" style={{
      background: featured ? 'var(--ink)' : '#fff',
      color: ink,
      border: featured ? 'none' : '1px solid var(--line)',
      borderRadius: 28,
      padding: 'clamp(28px, 4vw, 48px)',
      position: 'relative',
    }}>
      {/* Left: what the plan is */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', color: muted, textTransform: 'uppercase' }}>
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <span style={{ height: 1, width: 32, background: hairline }}/>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: featured ? 'rgba(255,255,255,0.85)' : 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 500 }} {...bind(p('tag'))}>
            {plan.tag}
          </span>
          {featured && (
            <span style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap' }}>
              Most popular
            </span>
          )}
        </div>
        <h3 className="display-3" style={{ margin: 0, fontSize: 'clamp(30px, 3vw, 44px)', color: ink }} {...bind(p('name'))}>
          {plan.name}
        </h3>
        <p className="h-lead" style={{ marginTop: 16, maxWidth: '44ch', color: body }} {...bind(p('blurb'))}>
          {plan.blurb}
        </p>
        <div style={{ marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: muted }} {...bind(p('idealFor'))}>
          {plan.idealFor}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }} {...bind(p('badges'))}>
          {badges.map((n, j) => (
            <span key={j} style={{
              padding: '5px 12px',
              border: '1px solid ' + hairline,
              borderRadius: 999, fontSize: 12,
              color: body,
            }}>{n}</span>
          ))}
        </div>
      </div>

      {/* Right: what's included + detail link */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', color: muted, textTransform: 'uppercase', marginBottom: 18 }}>
          What&rsquo;s included
        </div>
        <ul className="plan-row__features" style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }} {...bind(p('features'))}>
          {(plan.features || []).map((f, j) => (
            <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14.5, lineHeight: 1.5, color: body }}>
              <span style={{
                width: 18, height: 18, borderRadius: 999,
                background: featured ? 'rgba(255,255,255,0.14)' : 'var(--surface)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
              }}>
                <svg width="9" height="9" viewBox="0 0 9 9"><path d="M2 4.5l1.5 1.5 3.5-3.5" stroke={featured ? '#fff' : '#1a3d2a'} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid ' + hairline, display: 'flex', justifyContent: 'flex-end' }}>
          <a href={plan.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 500, color: ink, borderBottom: '1px solid ' + (featured ? 'rgba(255,255,255,0.4)' : 'rgba(26,61,42,0.3)'), paddingBottom: 2 }} {...bind(p('cta'))}>
            {plan.cta}
            <svg width="12" height="12" viewBox="0 0 14 14"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      </div>
    </article>
  );
}

export { Pricing };
