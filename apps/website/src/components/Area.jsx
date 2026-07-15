'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Service area (illustrated map of Accra, Ghana)
// Areas are the ones named in the site content archive only.

const AREAS = [
  { name: 'East Legon',  x: 58, y: 36 },
  { name: 'Cantonments', x: 34, y: 62 },
  { name: 'Trasacco',    x: 70, y: 30 },
  { name: 'Spintex',     x: 74, y: 54 },
];

function Area() {
  const { content, editMode } = useCmsContent('page.about', {});
  const ar = content?.area || {};
  const bind = (p) => cmsBind(editMode, 'page.about', `area.${p}`);
  const [hover, setHover] = React.useState(null);
  const [zip, setZip] = React.useState('');
  const [zipResult, setZipResult] = React.useState(null);

  const checkZip = () => {
    if (!zip.trim()) {
      setZipResult({ ok: false, msg: 'Enter your area or GhanaPost GPS' });
      return;
    }
    setZipResult({ ok: true, msg: 'Thanks — we’ll confirm coverage for your area.' });
  };

  return (
    <section className="section" id="area">
      <div className="wrap">
        <div className="r-grid-2-r" style={{
          alignItems: 'center',
        }}>
          <div>
            <span className="h-eyebrow" {...bind('eyebrow')}>{ar.eyebrow || 'Service area'}</span>
            <h2 className="display-2" style={{ margin: '16px 0 0' }}>
              <span {...bind('title')}>{ar.title || 'From East Legon to'}</span><br/>
              <span className="serif-italic muted" {...bind('titleAccent')}>{ar.titleAccent || 'Trasacco,'}</span><span {...bind('titleEnd')}>{ar.titleEnd || ' across Accra.'}</span>
            </h2>
            <p className="h-lead" style={{ margin: '20px 0 28px', maxWidth: '40ch' }} {...bind('lead')}>
              {ar.lead || 'We provide professional pool maintenance and water management to residential and commercial properties across Accra — and also serve Kumasi and Takoradi.'}
            </p>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: 6,
              border: '1px solid var(--line)',
              borderRadius: 999,
              background: '#fff',
              width: 'min(440px, 100%)',
            }}>
              <input
                value={zip}
                onChange={(e) => { setZip(e.target.value.slice(0, 24)); setZipResult(null); }}
                placeholder="Your area or GhanaPost GPS"
                style={{
                  all: 'unset',
                  flex: 1, padding: '0 16px',
                  fontSize: 15, color: 'var(--ink)',
                }}
              />
              <button className="btn btn-sm" onClick={checkZip}>
                Check coverage
              </button>
            </div>
            {zipResult && (
              <div style={{
                marginTop: 16, display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 14, fontWeight: 500,
                color: zipResult.ok ? '#1f7547' : '#a23d2a',
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16">
                  {zipResult.ok
                    ? <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    : <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>}
                </svg>
                {zipResult.msg}
              </div>
            )}

            <div style={{ marginTop: 40 }}>
              <div className="h-eyebrow" style={{ marginBottom: 14 }}>Accra neighbourhoods</div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px',
                maxWidth: 380,
              }}>
                {AREAS.map(a => (
                  <div key={a.name} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 14, padding: '4px 0',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
                    <span>{a.name}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, fontSize: 13, color: 'var(--ink-3)' }}>
                Also serving <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>Kumasi</strong> and <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>Takoradi</strong>.
              </div>
            </div>
          </div>

          <div style={{
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: 24,
            padding: 32,
            position: 'relative',
            aspectRatio: '1 / 1',
          }}>
            <RegionMap areas={AREAS} hover={hover} setHover={setHover} />
            <div style={{
              position: 'absolute', left: 24, top: 24,
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--ink-3)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div>Accra Metropolitan</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>5.6&deg;N &middot; 0.2&deg;W</div>
            </div>
            <div style={{
              position: 'absolute', right: 24, bottom: 24,
              padding: '10px 14px',
              background: '#fff', borderRadius: 12,
              border: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 16px rgba(0,62,92,0.04)',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }}/>
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                Hover a dot for the area
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RegionMap({ areas, hover, setHover }) {
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <pattern id="dotgrid" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="0.6" cy="0.6" r="0.4" fill="rgba(0,62,92,0.10)" />
        </pattern>
      </defs>
      {/* Accra land mass: rough coast on south, with Tema to the east */}
      <path
        d="M 4 12 Q 18 6, 36 8 L 60 6 Q 80 8, 94 14 L 94 70 Q 86 78, 70 78 L 36 80 Q 16 78, 6 70 Q 2 50, 4 12 Z"
        fill="url(#dotgrid)"
        stroke="rgba(0,62,92,0.18)"
        strokeWidth="0.3"
      />
      {/* Gulf of Guinea — ocean below */}
      <path
        d="M 0 78 Q 16 84, 36 80 L 70 78 Q 86 78, 94 70 L 100 100 L 0 100 Z"
        fill="#cfe5ef"
        opacity="0.7"
      />
      <path d="M 6 90 q 2 -1 4 0 t 4 0 t 4 0 t 4 0" fill="none" stroke="rgba(0,62,92,0.18)" strokeWidth="0.25"/>
      <path d="M 30 94 q 2 -1 4 0 t 4 0 t 4 0 t 4 0" fill="none" stroke="rgba(0,62,92,0.18)" strokeWidth="0.25"/>
      <path d="M 60 92 q 2 -1 4 0 t 4 0 t 4 0 t 4 0" fill="none" stroke="rgba(0,62,92,0.18)" strokeWidth="0.25"/>

      {/* HQ marker — Mempeasem */}
      <g transform="translate(50 42)">
        <circle r="2.4" fill="var(--ink)" />
        <circle r="6" fill="none" stroke="var(--ink)" strokeWidth="0.3" opacity="0.3"/>
        <circle r="10" fill="none" stroke="var(--ink)" strokeWidth="0.2" opacity="0.18"/>
        <text x="3.5" y="1" fontSize="2.4" fill="var(--ink)" fontFamily="var(--font-mono)" letterSpacing="0.04em">HQ</text>
      </g>

      {areas.map(a => {
        const on = hover === a.name;
        return (
          <g key={a.name} transform={`translate(${a.x} ${a.y})`}
             onMouseEnter={() => setHover(a.name)}
             onMouseLeave={() => setHover(null)}
             style={{ cursor: 'default' }}
          >
            <circle r={on ? 2.8 : 1.4} fill={on ? 'var(--accent)' : 'var(--ink)'} stroke="#fff" strokeWidth="0.4"/>
            {on && (
              <g transform="translate(0 -4)">
                <rect x="-14" y="-5" width="28" height="6" rx="1.4" fill="var(--ink)"/>
                <text x="0" y="-0.8" fontSize="2.2" fill="#fff" textAnchor="middle" fontFamily="var(--font-sans)">
                  {a.name}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}


export { Area };
