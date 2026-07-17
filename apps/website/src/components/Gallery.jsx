'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Before & after gallery with interactive slider. CMS: page.home → gallery.

const PAIRS = [
  { id: 'green-restoration', title: 'Green pool restoration', sub: 'Real PoolCare project', before: '/images/gallery-green-before.webp', after: '/images/gallery-green-after.webp', beforeBg: 'linear-gradient(135deg,#5d6f3a,#3d5530)', afterBg: 'linear-gradient(135deg,#cfe5ef,#3c8bb0)' },
  { id: 'pool-restoration', title: 'Pool restoration & finishing', sub: 'Real PoolCare project', before: '/images/gallery-restoration-before.webp', after: '/images/gallery-restoration-after.webp', beforeBg: 'linear-gradient(135deg,#9aa28a,#6e7960)', afterBg: 'linear-gradient(135deg,#0d2419,#1a3d2a)' },
  { id: 'algae-recovery', title: 'Emergency algae recovery', sub: 'Real PoolCare project', before: '/images/gallery-algae-before.webp', after: '/images/gallery-algae-after.webp', beforeBg: 'linear-gradient(135deg,#5d6f3a,#3d5530)', afterBg: 'linear-gradient(135deg,#cfe5ef,#3c8bb0)' },
];

function Gallery() {
  const { content, editMode } = useCmsContent('page.home', {});
  const s = content?.gallery || {};
  const pairs = s.pairs || PAIRS;
  const bind = (p) => cmsBind(editMode, 'page.home', `gallery.${p}`);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const idx = Math.min(activeIdx, pairs.length - 1);
  const pair = pairs[idx] || PAIRS[0];

  return (
    <section className="section" id="gallery" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="h-eyebrow" {...bind('eyebrow')}>{s.eyebrow || 'Before & after'}</span>
            <h2 className="display-2 section-head__title" style={{ marginTop: 16 }}>
              <span {...bind('title')}>{s.title || "Pools we've brought"}</span><br/>
              <span className="serif-italic muted" {...bind('titleAccent')}>{s.titleAccent || 'back into balance.'}</span>
            </h2>
          </div>
          <p className="h-lead section-head__lead" {...bind('lead')}>
            {s.lead || 'Beyond routine plans, PoolCare handles corrective and specialized work. Drag the slider to see the difference.'}
          </p>
        </div>

        <Comparator pair={pair} bind={bind} idx={idx} key={idx} />

        <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {pairs.map((p, i) => (
            <button key={i} type="button" onClick={() => setActiveIdx(i)} className={`ba-tab${idx === i ? ' ba-tab--active' : ''}`} aria-pressed={idx === i}>
              {/* Split thumbnail: left half = before, right half = after */}
              <span className="ba-tab__thumb">
                <span style={{ width: '50%', height: '100%', overflow: 'hidden', background: p.beforeBg }}>
                  <img loading="lazy" decoding="async" src={p.before} alt="" style={{ width: '200%', height: '100%', objectFit: 'cover', maxWidth: 'none' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </span>
                <span style={{ width: '50%', height: '100%', overflow: 'hidden', background: p.afterBg, borderLeft: '1.5px solid #fff' }}>
                  <img loading="lazy" decoding="async" src={p.after} alt="" style={{ width: '200%', height: '100%', objectFit: 'cover', maxWidth: 'none', marginLeft: '-100%' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </span>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{String(i + 1).padStart(2, '0')} — Before / After</span>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 3, color: 'var(--ink)' }} {...bind(`pairs.${i}.title`)}>{p.title}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparator({ pair, bind, idx }) {
  const [pct, setPct] = React.useState(50);
  const containerRef = React.useRef(null);
  const dragRef = React.useRef(false);
  const b = bind || (() => ({}));

  const move = (clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const v = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(98, Math.max(2, v)));
  };

  React.useEffect(() => {
    const onMove = (e) => { if (dragRef.current) move(e.clientX); };
    const onUp = () => { dragRef.current = false; };
    const onTouch = (e) => { if (dragRef.current && e.touches[0]) move(e.touches[0].clientX); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouch);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  return (
    <div ref={containerRef}
      onMouseDown={(e) => { dragRef.current = true; move(e.clientX); }}
      onTouchStart={(e) => { dragRef.current = true; if (e.touches[0]) move(e.touches[0].clientX); }}
      style={{ position: 'relative', height: 'min(72vh, 720px)', minHeight: 460, borderRadius: 24, overflow: 'hidden', cursor: 'ew-resize', userSelect: 'none', background: pair.afterBg }}>
      <img loading="lazy" decoding="async" src={pair.after} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.currentTarget.style.display = 'none'} />
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pct}% 0 0)`, background: pair.beforeBg }}>
        <img loading="lazy" decoding="async" src={pair.before} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.currentTarget.style.display = 'none'} />
      </div>
      <span style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(10,31,58,0.85)', color: '#fff', padding: '8px 12px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', backdropFilter: 'blur(6px)' }}>Before</span>
      <span style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.92)', color: 'var(--ink)', padding: '8px 12px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', backdropFilter: 'blur(6px)' }}>After</span>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: 2, background: '#fff', transform: 'translateX(-1px)', boxShadow: '0 0 24px rgba(0,0,0,0.25)' }} />
      <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', width: 48, height: 48, borderRadius: 999, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M7 5l-4 5 4 5M13 5l4 5-4 5" stroke="#1a3d2a" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <div style={{ position: 'absolute', bottom: 24, left: 24, color: '#fff', maxWidth: '60%' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 2.4vw, 36px)', letterSpacing: '-0.02em', textShadow: '0 2px 16px rgba(0,0,0,0.4)' }} {...b(`pairs.${idx}.title`)}>{pair.title}</div>
        <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.85)', fontSize: 13 }} {...b(`pairs.${idx}.sub`)}>{pair.sub}</div>
      </div>
    </div>
  );
}

export { Gallery };
