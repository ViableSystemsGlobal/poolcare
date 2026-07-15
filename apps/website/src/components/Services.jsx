'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Services as stacking cards. CMS: page.home → services.

const SERVICES = [
  { n: '01', label: 'Routine maintenance', title: 'Consistent cleaning,\nstructured every visit.', blurb: 'Consistent cleaning and surface care carried out through a structured service process to maintain clarity and hygiene.', bullets: ['Defined visit checklist', 'Skim, brush, vacuum, basket-empty', 'Digital service log per visit'], bg: 'linear-gradient(160deg, #1a3d2a 0%, #2d6248 60%, #5da37c 100%)', image: '/images/service-routine.webp' },
  { n: '02', label: 'Water chemistry', title: 'Balanced water,\ntested and dosed.', blurb: 'Accurate water testing and controlled chemical dosing to maintain balanced conditions and prevent long-term damage.', bullets: ['Tested to 7 chemistry markers', 'Controlled dosing log', 'Monthly flocculant on Premium+'], bg: 'linear-gradient(160deg, #233f2c 0%, #3b6b4b 60%, #88ab8e 100%)', image: '/images/service-chemistry.webp' },
  { n: '03', label: 'Filtration & system', title: 'Circulation,\ncontinuously protected.', blurb: 'Monitoring of circulation, filtration, and system performance to ensure efficient operation and prevent strain on equipment.', bullets: ['Filter cleans on schedule', 'Pump & circulation checks', 'Performance reporting'], bg: 'linear-gradient(160deg, #0d2419 0%, #1a3d2a 60%, #397d54 100%)', image: '/images/service-filtration.webp' },
  { n: '04', label: 'Equipment monitoring', title: 'Issues flagged\nbefore they break.', blurb: 'Continuous inspection and digital reporting of equipment condition to detect issues early and maintain system reliability.', bullets: ['Preventive equipment checks', 'Issue flagging in-app', 'Photo + reading reports'], bg: 'linear-gradient(160deg, #1a3d2a 0%, #4a7359 60%, #c4d4b8 100%)', image: '/images/service-monitoring.webp' },
];

const SPECIALIZED = ['Emergency algae recovery', 'Green pool restoration', 'Pump replacement', 'Heater repair', 'Leak detection', 'Tile acid wash', 'Spa repair'];

function Services({ showSpecialized = true }) {
  const { content, editMode } = useCmsContent('page.home', {});
  const s = content?.services || {};
  const items = s.items || SERVICES;
  const bind = (p) => cmsBind(editMode, 'page.home', `services.${p}`);

  return (
    <section className="section app-stack" id="services">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="h-eyebrow" {...bind('eyebrow')}>{s.eyebrow || 'Services'}</span>
            <h2 className="display-2 section-head__title" style={{ marginTop: 16 }}>
              <span {...bind('title')}>{s.title || 'Complete pool care,'}</span><br/>
              <span className="serif-italic muted" {...bind('titleAccent')}>{s.titleAccent || 'managed'}</span><span {...bind('titleEnd')}>{s.titleEnd || ' with precision.'}</span>
            </h2>
          </div>
          <p className="h-lead section-head__lead" {...bind('lead')}>
            {s.lead || 'Every pool is assessed, assigned a service structure, and managed through a system that ensures consistency, accountability and control.'}
          </p>
        </div>

        <div className="app-stack__rail">
          {items.map((it, i) => (
            <ServiceCard key={i} {...it} index={i} total={items.length} bind={bind} idx={i} />
          ))}
        </div>

        {showSpecialized && (
          <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '20px 24px', background: '#fff', border: '1px solid var(--line)', borderRadius: 16 }}>
            <span className="h-eyebrow" style={{ marginRight: 8 }}>Specialized services</span>
            {SPECIALIZED.map((t) => (
              <span key={t} style={{ padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 999, fontSize: 13, color: 'var(--ink-2)', background: '#fff' }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ServiceCard({ n, label, title, blurb, bullets, bg, image, index, total, bind, idx }) {
  const b = bind || (() => ({}));
  return (
    <article className="app-stack__card" style={{ top: `calc(clamp(72px, 12vh, 100px) + ${index * 14}px)`, zIndex: index + 1 }}>
      <div className="app-stack__card-inner r-grid-2-app" style={{ background: '#fff' }}>
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
        <div className="app-stack__media" style={{ position: 'relative', overflow: 'hidden', background: bg, minHeight: 540 }}>
          <img loading="lazy" decoding="async" src={image} alt={label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
      </div>
    </article>
  );
}

export { Services };
