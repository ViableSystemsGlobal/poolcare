'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — App section / 4 stacking feature cards. CMS: page.home → appDownload.

const FEATURES = [
  { n: '01', label: 'Your dashboard', title: 'Every pool,\non one dashboard.', blurb: 'See all your pools, your balance and any upcoming visits the moment you open the app — with one-tap access to request a service or chat with your technician.', bullets: ['All your pools at a glance', 'Balance & billing up front', 'Request or chat in a tap'], bg: 'linear-gradient(160deg, #1a3d2a 0%, #2d6248 70%, #5da37c 100%)', surface: 'var(--paper)', shot: '/images/app-dashboard.webp' },
  { n: '02', label: 'Book in seconds', title: 'Book a visit,\nfrom your phone.', blurb: 'Pick the pool, choose what you need — routine visit, repair, emergency or a cleaning issue — then set your preferred date and time. Confirm in a tap.', bullets: ['Routine, repair or emergency', 'Choose your date & time', 'Confirm the request instantly'], bg: 'linear-gradient(160deg, #233f2c 0%, #3b6b4b 70%, #88ab8e 100%)', surface: '#fff', shot: '/images/app-book.webp' },
  { n: '03', label: 'Service records', title: 'Every visit,\nkept on record.', blurb: 'Each pool keeps its own maintenance history. Service reports appear after every visit, so you always have a clear, dated record of the work done.', bullets: ['Maintenance history per pool', 'Service reports after each visit', 'Book service or request help'], bg: 'linear-gradient(160deg, #0d2419 0%, #1a3d2a 60%, #397d54 100%)', surface: 'var(--surface)', shot: '/images/app-history.webp' },
  { n: '04', label: 'Account & family', title: 'Bring everyone\nwho needs access.', blurb: 'Manage billing, plans and payment in one place — and share household access with family. Service reminders keep everyone in the loop.', bullets: ['Billing, plans & invoices', 'Family & household sharing', 'Service reminders'], bg: 'linear-gradient(160deg, #1a3d2a 0%, #4a7359 70%, #c4d4b8 100%)', surface: '#fff', shot: '/images/app-account.webp' },
];

function AppDownload() {
  const { content, editMode } = useCmsContent('page.home', {});
  const s = content?.appDownload || {};
  const items = s.items || FEATURES;
  const bind = (p) => cmsBind(editMode, 'page.home', `appDownload.${p}`);

  return (
    <section className="section app-stack" id="app">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="h-eyebrow" {...bind('eyebrow')}>{s.eyebrow || 'The PoolCare app'}</span>
            <h2 className="display-2 section-head__title" style={{ marginTop: 16 }}>
              <span {...bind('title')}>{s.title || 'Every pool, in'}</span><br/>
              <span className="serif-italic muted" {...bind('titleAccent')}>{s.titleAccent || 'one connected system.'}</span>
            </h2>
          </div>
          <p className="h-lead section-head__lead" {...bind('lead')}>
            {s.lead || 'Pool, technicians and management connected as one system — every service tracked, verified, and executed with precision.'}
          </p>
        </div>

        <div className="app-stack__rail">
          {items.map((f, i) => (
            <FeatureCard key={i} {...f} index={i} total={items.length} bind={bind} idx={i} />
          ))}
        </div>

        <div style={{ marginTop: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', padding: '24px 28px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em' }} {...bind('ctaTitle')}>{s.ctaTitle || 'Get the PoolCare app'}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }} {...bind('ctaSub')}>{s.ctaSub || 'Free for every customer. iOS & Android.'}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <StoreBadge store="App Store" />
            <StoreBadge store="Google Play" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ n, label, title, blurb, bullets, bg, surface, shot, index, total, bind, idx }) {
  const b = bind || (() => ({}));
  return (
    <article className="app-stack__card" style={{ top: `calc(clamp(72px, 12vh, 100px) + ${index * 14}px)`, zIndex: index + 1 }}>
      <div className="app-stack__card-inner r-grid-2-app" style={{ background: surface }}>
        <div className="pad-card-lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{n} / {String(total).padStart(2, '0')}</span>
            <span style={{ height: 1, width: 32, background: 'var(--line)' }}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 500 }} {...b(`items.${idx}.label`)}>{label}</span>
          </div>
          <h3 className="display-3" style={{ margin: 0, fontSize: 'clamp(32px, 3.6vw, 56px)', whiteSpace: 'pre-line' }} {...b(`items.${idx}.title`)}>{title}</h3>
          <p className="h-lead" style={{ marginTop: 24, maxWidth: '38ch' }} {...b(`items.${idx}.blurb`)}>{blurb}</p>
          <ul style={{ marginTop: 32, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }} {...b(`items.${idx}.bullets`)}>
            {bullets.map((bl, j) => (
              <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, color: 'var(--ink-2)' }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2.5 5.5L4.5 7.5L8.5 3.5" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                {bl}
              </li>
            ))}
          </ul>
        </div>
        <div className="app-stack__media" style={{ position: 'relative', overflow: 'hidden', background: bg, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '48px 0 0', minHeight: 540 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 80%, rgba(243,232,200,0.16), transparent 40%), radial-gradient(circle at 70% 20%, rgba(255,255,255,0.14), transparent 40%)' }}/>
          <PhoneShot shot={shot} alt={label} />
        </div>
      </div>
    </article>
  );
}

function StoreBadge({ store }) {
  const isApple = store === 'App Store';
  return (
    <button style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: 12, background: 'var(--ink)', color: '#fff', cursor: 'default' }}>
      {isApple ? (
        <svg width="22" height="26" viewBox="0 0 22 26" fill="#fff"><path d="M16.4 13.6c0-2.4 2-3.6 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.7 2.3 2.9 2.3 1.2-.1 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.8-2.3.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.4-.9-2.4-3.6zm-2.3-6.5c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.7-1.3z"/></svg>
      ) : (
        <svg width="22" height="24" viewBox="0 0 22 24" fill="#fff"><path d="M2.3 1.6 13 12 2.3 22.4c-.3-.3-.5-.7-.5-1.2V2.8c0-.5.2-.9.5-1.2zM14.8 13.8l2.6 2.6-12 6.8 9.4-9.4zm0-3.6L5.4 .8l12 6.8-2.6 2.6zM18.6 9.7l2.7 1.5c.6.4.6 1.3 0 1.6l-2.7 1.5L15.7 12l2.9-2.3z"/></svg>
      )}
      <span>
        <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: '0.02em' }}>{isApple ? 'Download on the' : 'Get it on'}</div>
        <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em' }}>{store}</div>
      </span>
    </button>
  );
}

function PhoneShot({ shot, alt }) {
  return (
    <div className="phone-frame" style={{ width: 280, height: 560, background: '#0d2419', borderRadius: '44px 44px 0 0', padding: 10, boxShadow: '0 30px 80px rgba(0,0,0,0.5)', position: 'relative', border: '6px solid #0d2419', borderBottom: 'none' }}>
      <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 104, height: 24, background: '#0d2419', borderRadius: '0 0 16px 16px', zIndex: 2 }}/>
      <div style={{ borderRadius: '34px 34px 0 0', height: '100%', overflow: 'hidden', background: '#fff' }}>
        <img loading="lazy" decoding="async" src={shot} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </div>
    </div>
  );
}

export { AppDownload };
