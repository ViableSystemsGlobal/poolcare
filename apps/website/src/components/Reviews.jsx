'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Reviews carousel. CMS: page.home → reviews.

const REVIEWS = [
  { quote: "We fully trust PoolCare. Their structured servicing and water management keep our pool clear and running smoothly.", name: 'John D', role: 'Pool Owner', avatarBg: 'linear-gradient(135deg,#29c0e0,#1a3d2a)', initials: 'JD' },
  { quote: "Since partnering with PoolCare, maintaining our pool has been simple. Their team provides reliable service and consistent quality every week.", name: 'Faustina Bossman', role: 'Villa Owner', avatarBg: 'linear-gradient(135deg,#e6d5ae,#a88a55)', initials: 'FB' },
  { quote: "We trust PoolCare completely. Their structured servicing and water management system keeps our pool clear and smoothly.", name: 'Daniel Agyeman', role: 'Pool Owner', avatarBg: 'linear-gradient(135deg,#7adcef,#1a3d2a)', initials: 'DA' },
  { quote: "Since working with PoolCare, our pool maintenance has been effortless. The team delivers dependable service and excellent quality every week.", name: 'Roda Appiah', role: 'Pool Owner', avatarBg: 'linear-gradient(135deg,#f6d8c4,#c98567)', initials: 'RA' },
];

function Reviews() {
  const { content, editMode } = useCmsContent('page.home', {});
  const sec = content?.reviews || {};
  const items = sec.items || REVIEWS;
  const bind = (p) => cmsBind(editMode, 'page.home', `reviews.${p}`);
  const [idx, setIdx] = React.useState(0);
  const total = items.length;
  const i = Math.min(idx, total - 1);
  const r = items[i] || REVIEWS[0];

  React.useEffect(() => {
    const t = setInterval(() => setIdx((x) => (x + 1) % total), 8000);
    return () => clearInterval(t);
  }, [total]);

  const next = () => setIdx((x) => (x + 1) % total);
  const prev = () => setIdx((x) => (x - 1 + total) % total);

  return (
    <section className="section" id="reviews" style={{ background: '#fff', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="h-eyebrow" {...bind('eyebrow')}>{sec.eyebrow || 'What clients say'}</span>
            <h2 className="display-2 section-head__title" style={{ marginTop: 16 }}>
              <span {...bind('title')}>{sec.title || 'Trusted across'}</span> <span className="serif-italic muted" {...bind('titleAccent')}>{sec.titleAccent || 'Accra,'}</span><br/>
              <span {...bind('titleEnd')}>{sec.titleEnd || 'one structured system.'}</span>
            </h2>
          </div>
          <p className="h-lead section-head__lead" {...bind('lead')}>
            {sec.lead || "From luxury villas to gated communities and guest houses—here's what our clients say about a pool, smartly managed."}
          </p>
        </div>

        <div className="pad-card-lg" style={{ background: '#fff', borderRadius: 28, position: 'relative', overflow: 'hidden', minHeight: 360 }}>
          <div style={{ position: 'absolute', top: 28, right: 40, fontFamily: 'var(--font-serif)', fontSize: 180, lineHeight: 1, color: 'var(--surface-2)', pointerEvents: 'none', userSelect: 'none' }}>&rdquo;</div>

          <div style={{ position: 'relative', maxWidth: '880px' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
              {[...Array(5)].map((_, k) => (
                <svg key={k} width="18" height="18" viewBox="0 0 18 18">
                  <path d="M9 1.5l2.2 4.6 5 .7-3.6 3.5.8 5L9 12.8l-4.4 2.3.8-5L1.8 6.8l5-.7L9 1.5z" fill="var(--accent)"/>
                </svg>
              ))}
            </div>

            <blockquote style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 2.6vw, 38px)', lineHeight: 1.25, letterSpacing: '-0.02em', color: 'var(--ink)', fontWeight: 400, textWrap: 'pretty', minHeight: 160 }} {...bind(`items.${i}.quote`)}>
              &ldquo;{r.quote}&rdquo;
            </blockquote>

            <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 999, background: r.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 500, fontSize: 18, letterSpacing: '-0.01em' }}>{r.initials}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em' }} {...bind(`items.${i}.name`)}>{r.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }} {...bind(`items.${i}.role`)}>{r.role}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', color: 'var(--ink-3)', marginRight: 8 }}>
                  {String(i + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                </span>
                <button onClick={prev} className="btn btn-light" style={{ height: 44, width: 44, padding: 0, justifyContent: 'center', border: '1px solid var(--line)' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 3l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button onClick={next} className="btn" style={{ height: 44, width: 44, padding: 0, justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export { Reviews };
