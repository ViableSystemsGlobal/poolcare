'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Pricing plans. Content is CMS-driven (key "plans"); these values are
// the bundled fallback used if the API is unreachable, and the day-one seed.
const FALLBACK = {
  section: {
    eyebrow: 'Pricing',
    title: 'Choose the level of management your pool needs.',
    lead: 'Four plans, tuned to the complexity of your system and the level of control you expect — from service-only maintenance to fully managed water systems.',
    note: 'Indicative monthly ranges — final pricing is confirmed after a free on-site assessment. Flex excludes chemicals; Premium and above include them.',
  },
  plans: [
    { id: 'flex', name: 'Flex', href: '/flex', tag: 'Service-only maintenance', blurb: 'For clients who prefer to supply their own chemicals while receiving structured cleaning, system checks and water management guidance.', idealFor: 'Any pool · client-supplied chemicals', priceFrom: 900, priceTo: 1400, currency: 'GHS', cta: 'Flex plan details', features: ['Routine cleaning and servicings', 'Water testing and dosing guidance', 'Equipment inspection and reporting', 'Digital service logs'], badges: ['Service-only', '48h response'], featured: false },
    { id: 'premium', name: 'Premium', href: '/premium', tag: 'Stable water management', blurb: 'Designed for residential pools that require consistent servicing, balanced water chemistry and routine system care.', idealFor: 'Pools up to 60 m³', priceFrom: 1600, priceTo: 2400, currency: 'GHS', cta: 'Premium plan details', features: ['Routine pool maintenance', 'Water testing and chemical balancing', 'Monthly flocculant treatment', 'App-based service tracking'], badges: ['Chemicals included', '48h response'], featured: false },
    { id: 'premium-plus', name: 'Premium Plus', href: '/premium-plus', tag: 'Performance & equipment care', blurb: 'For pools requiring enhanced monitoring, proactive system care and improved water performance.', idealFor: 'Pools 60–120 m³', priceFrom: 2500, priceTo: 3400, currency: 'GHS', cta: 'Premium Plus details', features: ['Everything in Premium', 'Advanced water profiling', 'Preventive equipment checks', 'Algaecide and shock treatments'], badges: ['Chemicals included', '24–36h priority'], featured: true },
    { id: 'luxury-villa', name: 'Luxury Villa', href: '/luxury-villa', tag: 'Elite water management', blurb: 'A structured management program for high-end properties where water clarity and system integrity must remain uncompromised.', idealFor: 'Large villas & estates · 60 m³+', priceFrom: 3500, priceTo: 4500, currency: 'GHS', cta: 'Luxury Villa details', features: ['Full water chemistry management', 'Advanced system diagnostics', 'Priority response scheduling', 'Monthly performance reporting'], badges: ['VIP priority', '12h target'], featured: false },
  ],
};

function Pricing() {
  const { content, editMode } = useCmsContent('plans', FALLBACK);
  const section = content?.section || FALLBACK.section;
  const plans = content?.plans || FALLBACK.plans;
  const bind = (path) => cmsBind(editMode, 'plans', path);

  return (
    <section className="section" style={{ background: 'var(--ink)', color: '#fff' }} id="pricing">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="h-eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }} {...bind('section.eyebrow')}>{section.eyebrow}</span>
            <h2 className="display-2 section-head__title" style={{ marginTop: 16, color: '#fff' }} {...bind('section.title')}>
              {section.title}
            </h2>
          </div>
          <p className="h-lead section-head__lead" style={{ color: 'rgba(255,255,255,0.7)' }} {...bind('section.lead')}>
            {section.lead}
          </p>
        </div>

        <div className="r-grid-4-cards">
          {plans.map((p, i) => <PlanCard key={p.id || i} plan={p} bind={bind} index={i} />)}
        </div>

        <div style={{
          marginTop: 28, padding: '20px 24px',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
          flexWrap: 'wrap',
          color: 'rgba(255,255,255,0.75)',
          fontSize: 14,
        }}>
          <span {...bind('section.note')}>{section.note}</span>
          <a href="/assessment" style={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.4)', paddingBottom: 2 }}>Book a free assessment &rarr;</a>
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan, bind, index }) {
  const featured = plan.featured ?? plan.feature;
  const badges = plan.badges || plan.notable || [];
  const p = (field) => `plans.${index}.${field}`;
  return (
    <article style={{
      background: featured ? '#fff' : 'rgba(255,255,255,0.04)',
      color: featured ? 'var(--ink)' : '#fff',
      border: featured ? 'none' : '1px solid rgba(255,255,255,0.10)',
      borderRadius: 20,
      padding: 28,
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em',
      }} {...bind(p('name'))}>
        {plan.name}
      </div>
      <div style={{
        marginTop: 4,
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: featured ? 'var(--ink-3)' : 'rgba(255,255,255,0.5)',
      }} {...bind(p('tag'))}>
        {plan.tag}
      </div>
      <p style={{
        margin: '14px 0 20px',
        fontSize: 13.5, lineHeight: 1.5,
        color: featured ? 'var(--ink-3)' : 'rgba(255,255,255,0.65)',
        maxWidth: '30ch',
        minHeight: '5.4em',
      }} {...bind(p('blurb'))}>{plan.blurb}</p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }} {...bind(p('priceFrom'))}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>GH&#8373;</span>
        <span className="tabnum" style={{
          fontFamily: 'var(--font-display)',
          fontSize: 32, lineHeight: 1, letterSpacing: '-0.03em', fontWeight: 400,
        }}>
          {Number(plan.priceFrom).toLocaleString()}&ndash;{Number(plan.priceTo).toLocaleString()}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: featured ? 'var(--ink-3)' : 'rgba(255,255,255,0.55)' }}>
        / month &middot; indicative
      </div>
      <div style={{
        marginTop: 10,
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em',
        color: featured ? 'var(--ink-3)' : 'rgba(255,255,255,0.5)',
      }} {...bind(p('idealFor'))}>
        {plan.idealFor}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }} {...bind(p('badges'))}>
        {badges.map((n, j) => (
          <span key={j} style={{
            padding: '5px 10px',
            border: '1px solid ' + (featured ? 'var(--line)' : 'rgba(255,255,255,0.15)'),
            borderRadius: 999, fontSize: 11,
            color: featured ? 'var(--ink-2)' : 'rgba(255,255,255,0.8)',
          }}>{n}</span>
        ))}
      </div>

      <hr style={{
        border: 0, height: 1, margin: '22px 0',
        background: featured ? 'var(--line)' : 'rgba(255,255,255,0.10)',
      }}/>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }} {...bind(p('features'))}>
        {(plan.features || []).map((f, j) => (
          <li key={j} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            fontSize: 13.5, lineHeight: 1.45,
            color: featured ? 'var(--ink-2)' : 'rgba(255,255,255,0.82)',
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: 999,
              background: featured ? 'var(--surface)' : 'rgba(255,255,255,0.10)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
            }}>
              <svg width="8" height="8" viewBox="0 0 9 9"><path d="M2 4.5l1.5 1.5 3.5-3.5" stroke={featured ? '#1a3d2a' : '#fff'} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <a className="btn btn-sm" href={plan.href} style={{
        marginTop: 22, width: '100%', justifyContent: 'center',
        background: featured ? 'var(--ink)' : '#fff',
        color: featured ? '#fff' : 'var(--ink)',
      }} {...bind(p('cta'))}>
        {plan.cta}
        <svg width="12" height="12" viewBox="0 0 14 14"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </a>
    </article>
  );
}

export { Pricing };
