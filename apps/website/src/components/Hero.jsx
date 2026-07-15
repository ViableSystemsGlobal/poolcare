'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Hero (full-bleed photo overlay). Content is CMS-driven (key "page.home").

const HERO_IMAGES = {
  technician: "/images/hero-pool.webp",
  water:      "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=2400&q=80&auto=format&fit=crop",
  backyard:   "https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=2400&q=80&auto=format&fit=crop",
  tile:       "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=2400&q=80&auto=format&fit=crop",
};

const FALLBACK = {
  hero: {
    chip: "Book a pool assessment",
    title: "Your pool,",
    titleAccent: "expertly managed.",
    lead: "Not all pools require the same level of care. PoolCare plans are designed to match the complexity of your system and the level of control you expect — from flexible service-only maintenance to fully managed water systems.",
    ctaPrimary: { label: "Get an instant quote", href: "#quote" },
    ctaSecondary: { label: "View our plans", href: "/services-plans" },
    cardTitle: "Trusted across Accra",
    cardSubtitle: "Villas, communities & hospitality",
    badge: "Free water assessment on first visit",
    image: "/images/hero-pool.webp",
  },
};

function Hero({ imageKey = "technician" }) {
  const { content, editMode } = useCmsContent('page.home', FALLBACK);
  const h = content?.hero || FALLBACK.hero;
  const bind = (path) => cmsBind(editMode, 'page.home', `hero.${path}`);
  const src = h.image || HERO_IMAGES[imageKey] || HERO_IMAGES.technician;
  const cta1 = h.ctaPrimary || FALLBACK.hero.ctaPrimary;
  const cta2 = h.ctaSecondary || FALLBACK.hero.ctaSecondary;

  return (
    <section style={{ position: 'sticky', top: 0, zIndex: 0, width: '100%', padding: '88px 16px 16px', background: '#fff' }}>
      <div style={{ position: 'relative', width: '100%', height: 'min(92vh, 980px)', minHeight: 640, borderRadius: 14, overflow: 'hidden', background: '#0d2419', isolation: 'isolate' }}>
        <img src={src} alt="A PoolCare technician at work" fetchpriority="high" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.92) contrast(1.02)' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />

        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,15,32,0.55) 0%, rgba(5,15,32,0.15) 25%, rgba(5,15,32,0.10) 55%, rgba(5,15,32,0.75) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 60%, rgba(0,0,0,0) 0%, rgba(5,15,32,0.35) 100%)', pointerEvents: 'none' }} />

        <div style={{ position: 'absolute', top: 28, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10, color: '#fff' }}>
          <span className="chip chip-dark chip-dot" {...bind('chip')}>{h.chip}</span>
        </div>

        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', color: '#fff', textAlign: 'center' }}>
          <h1 className="display-1" style={{ margin: 0, maxWidth: '16ch', color: '#fff' }}>
            <span {...bind('title')}>{h.title}</span><br/>
            <span className="serif-italic" {...bind('titleAccent')}>{h.titleAccent}</span>
          </h1>

          <p className="h-lead" style={{ margin: '36px 0 0', maxWidth: 600, color: 'rgba(255,255,255,0.86)', fontSize: 'clamp(16px, 1.25vw, 20px)' }} {...bind('lead')}>
            {h.lead}
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 44, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a className="btn btn-light btn-lg" href={cta1.href} {...bind('ctaPrimary.label')}>{cta1.label}</a>
            <a className="btn btn-ghost btn-lg" href={cta2.href} {...bind('ctaSecondary.label')}>{cta2.label}</a>
          </div>
        </div>

        <div className="hero-card-stack" style={{ position: 'absolute', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 14, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink)', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" fill="var(--accent)" />
              <path d="M6 11.5l3.2 3.2L16 8" stroke="#1a3d2a" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 500, fontSize: 13.5, letterSpacing: '-0.01em' }} {...bind('cardTitle')}>{h.cardTitle}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }} {...bind('cardSubtitle')}>{h.cardSubtitle}</div>
            </div>
          </div>
          <div style={{ background: 'var(--accent)', borderRadius: 14, padding: '12px 14px', color: '#fff', fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span {...bind('badge')}>{h.badge}</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <div className="hide-mobile" style={{ position: 'absolute', right: 28, bottom: 28, color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Scroll</span>
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v9m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>
        </div>
      </div>
    </section>
  );
}

export { Hero, HERO_IMAGES };
