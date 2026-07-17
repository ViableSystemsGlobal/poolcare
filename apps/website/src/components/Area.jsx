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
              {ar.lead || 'We provide professional pool maintenance and water management to residential and commercial properties across Accra — and serve cities across Ghana.'}
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
                Also serving <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>Kumasi</strong>, <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>Takoradi</strong> and cities across Ghana.
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
            <RegionMap />
            <div style={{
              position: 'absolute', left: 24, top: 24,
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--ink-3)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div>Ghana</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>8.0&deg;N &middot; 1.0&deg;W</div>
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
                HQ in Accra &middot; serving cities across Ghana
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Real Ghana border (geoBoundaries ADM0, Douglas-Peucker simplified, equirect
// projection) with the twelve major cities at their true coordinates. Served
// cities are solid; the rest give national context.
const GHANA_PATH = 'M 78.3 76.5 L 80.1 75.3 L 80.1 74.6 L 78.7 74.6 L 77.9 73.4 L 77.5 72.3 L 76.2 72.3 L 75.7 71.7 L 74.7 71.3 L 74.2 70.8 L 73.7 69.7 L 73.9 68.8 L 73.2 68.7 L 73.2 68.4 L 72.6 68.1 L 72.7 66.5 L 71.8 66.3 L 71.6 65.8 L 71.9 65.7 L 71.1 65.4 L 71.5 64.2 L 70.9 63.8 L 71.0 63.5 L 72.1 62.9 L 72.0 62.3 L 72.3 61.8 L 72.1 61.3 L 72.9 58.8 L 72.7 57.7 L 72.3 57.6 L 71.6 57.7 L 70.8 56.7 L 71.0 56.4 L 71.0 55.0 L 71.8 54.6 L 72.0 53.4 L 72.3 53.4 L 72.4 51.3 L 72.0 48.2 L 72.2 47.1 L 72.0 46.7 L 72.6 45.9 L 73.8 45.5 L 73.8 44.8 L 73.6 44.0 L 73.0 43.6 L 72.7 42.7 L 70.3 41.1 L 69.1 39.1 L 69.3 39.0 L 69.2 38.6 L 69.8 38.7 L 70.0 38.3 L 70.3 38.5 L 70.6 38.3 L 71.1 37.4 L 70.1 35.1 L 70.3 33.7 L 71.1 32.9 L 70.8 32.1 L 71.3 31.5 L 71.6 30.2 L 71.0 29.6 L 70.7 29.7 L 70.7 29.3 L 70.0 29.0 L 68.8 29.0 L 68.4 29.6 L 67.7 29.9 L 67.0 29.5 L 67.1 29.1 L 67.5 29.3 L 68.1 28.8 L 67.2 28.6 L 67.2 27.9 L 68.7 27.9 L 69.1 27.7 L 68.9 26.7 L 68.2 25.8 L 68.7 24.2 L 68.7 23.3 L 69.1 22.9 L 68.8 22.4 L 68.7 21.6 L 69.4 21.8 L 69.6 21.3 L 68.7 20.7 L 68.8 18.6 L 69.3 17.9 L 68.3 17.9 L 68.5 17.5 L 67.9 16.9 L 68.0 16.7 L 67.8 16.4 L 66.9 16.3 L 66.6 16.6 L 65.8 14.8 L 63.1 13.3 L 62.8 12.3 L 63.0 11.5 L 63.6 10.9 L 63.8 9.0 L 64.4 8.6 L 64.2 7.1 L 63.7 6.9 L 62.5 7.1 L 62.0 6.9 L 62.0 6.5 L 60.3 6.0 L 60.0 6.4 L 60.3 6.7 L 59.4 6.9 L 59.1 7.4 L 58.9 6.8 L 58.6 6.7 L 58.1 7.0 L 58.0 8.0 L 57.4 8.0 L 56.9 8.6 L 56.3 8.6 L 55.9 9.6 L 55.6 9.7 L 55.4 9.2 L 54.9 9.0 L 55.1 8.6 L 52.9 8.3 L 52.3 8.5 L 52.1 8.9 L 51.3 8.4 L 45.0 8.5 L 44.6 8.1 L 42.5 8.1 L 42.4 8.5 L 41.5 8.4 L 40.4 8.7 L 30.0 8.6 L 25.6 8.3 L 25.4 8.9 L 25.7 9.6 L 25.1 10.0 L 24.8 11.5 L 24.1 12.3 L 24.5 12.7 L 24.1 13.4 L 25.1 15.9 L 26.4 16.3 L 25.6 16.8 L 25.3 17.7 L 26.6 18.8 L 26.1 19.6 L 26.1 20.6 L 26.7 22.6 L 26.4 23.5 L 26.9 24.4 L 26.1 25.5 L 26.1 26.1 L 26.7 26.9 L 26.4 27.5 L 26.4 28.0 L 27.5 28.9 L 27.7 30.5 L 27.1 31.5 L 27.9 32.3 L 26.4 33.9 L 26.5 34.4 L 26.3 35.0 L 26.7 35.4 L 28.0 35.7 L 27.9 36.4 L 28.4 36.9 L 28.4 37.6 L 28.8 38.2 L 28.4 38.7 L 28.9 38.7 L 30.2 46.6 L 29.4 47.1 L 28.8 47.0 L 28.5 47.4 L 28.9 48.4 L 28.8 48.8 L 27.8 49.0 L 26.8 50.5 L 26.3 50.1 L 26.2 51.2 L 25.6 51.8 L 24.4 54.7 L 23.7 59.3 L 24.0 59.8 L 23.0 61.2 L 22.9 62.1 L 22.1 62.3 L 20.2 65.5 L 20.2 66.2 L 20.7 67.0 L 19.9 68.4 L 20.2 68.6 L 20.9 73.4 L 21.3 73.4 L 21.9 74.7 L 22.3 76.7 L 23.1 78.6 L 23.0 80.7 L 23.9 80.7 L 23.8 81.7 L 24.2 82.0 L 25.2 81.4 L 26.4 82.0 L 26.7 84.5 L 27.1 85.2 L 27.0 85.8 L 26.4 85.8 L 26.2 86.5 L 26.4 87.0 L 26.6 86.9 L 26.5 87.5 L 27.0 88.5 L 26.6 89.0 L 24.9 88.8 L 23.9 89.3 L 22.9 88.8 L 21.8 88.9 L 21.8 89.1 L 32.1 91.3 L 33.3 91.8 L 33.6 92.4 L 34.6 93.3 L 35.4 93.4 L 35.6 94.0 L 37.1 93.7 L 38.7 92.5 L 40.2 92.1 L 40.4 91.5 L 41.1 91.0 L 41.7 90.8 L 42.1 90.0 L 47.1 89.0 L 49.3 87.7 L 53.0 87.5 L 54.2 86.3 L 55.5 85.9 L 55.7 85.6 L 57.3 85.2 L 57.6 84.5 L 59.0 83.6 L 62.2 82.7 L 64.2 81.7 L 64.9 81.0 L 67.2 80.0 L 68.8 79.7 L 74.0 80.0 L 76.5 79.7 L 77.3 79.0 L 77.4 77.9 Z';

const CITIES = [
  { name: 'Accra',      x: 61.4, y: 82.1, hq: true },
  { name: 'Kumasi',     x: 42.0, y: 67.3, served: true },
  { name: 'Takoradi',   x: 40.8, y: 91.3, served: true, dx: 2.6, dy: 2.6 },
  { name: 'Tema',       x: 63.7, y: 81.2, dx: 1.6, dy: 3.2 },
  { name: 'Cape Coast', x: 47.1, y: 89.0, anchor: 'middle', dx: 0, dy: -2.2 },
  { name: 'Koforidua',  x: 60.5, y: 75.4, anchor: 'end', dx: -2.2, dy: 0.8 },
  { name: 'Ho',         x: 70.3, y: 68.4, anchor: 'end', dx: -2.2 },
  { name: 'Tamale',     x: 52.6, y: 30.2 },
  { name: 'Bolgatanga', x: 52.4, y: 11.3 },
  { name: 'Wa',         x: 30.0, y: 21.2 },
  { name: 'Sunyani',    x: 32.5, y: 58.5, anchor: 'end', dx: -2.2 },
  { name: 'Techiman',   x: 37.7, y: 55.0 },
];

function RegionMap() {
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <pattern id="dotgrid" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="0.6" cy="0.6" r="0.4" fill="rgba(0,62,92,0.10)" />
        </pattern>
      </defs>

      {/* Ghana */}
      <path d={GHANA_PATH} fill="#fff" stroke="none" />
      <path d={GHANA_PATH} fill="url(#dotgrid)" stroke="rgba(0,62,92,0.25)" strokeWidth="0.4" strokeLinejoin="round" />

      {/* Gulf of Guinea — wave hints off the south coast */}
      <path className="gmap-wave" d="M 62 89 q 2 -1 4 0 t 4 0 t 4 0" fill="none" stroke="rgba(0,62,92,0.18)" strokeWidth="0.25"/>
      <path className="gmap-wave gmap-wave--late" d="M 48 95 q 2 -1 4 0 t 4 0 t 4 0" fill="none" stroke="rgba(0,62,92,0.18)" strokeWidth="0.25"/>
      <path className="gmap-wave" d="M 27 97 q 2 -1 4 0 t 4 0 t 4 0" fill="none" stroke="rgba(0,62,92,0.18)" strokeWidth="0.25"/>

      {/* Service network — arcs from HQ to every city */}
      {CITIES.filter((c) => !c.hq).map((c) => {
        const hq = CITIES.find((k) => k.hq);
        const mx = (hq.x + c.x) / 2 + (hq.y - c.y) * 0.18;
        const my = (hq.y + c.y) / 2 + (c.x - hq.x) * 0.18;
        return (
          <path
            key={`arc-${c.name}`}
            className="gmap-arc"
            d={`M ${hq.x} ${hq.y} Q ${mx} ${my} ${c.x} ${c.y}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="0.3"
            opacity="0.5"
          />
        );
      })}

      {CITIES.map((c) => {
        const dx = c.dx ?? 2.4;
        const dy = c.dy ?? 0.8;
        const anchor = c.anchor || 'start';
        return (
          <g key={c.name} transform={`translate(${c.x} ${c.y})`}>
            {c.hq ? (
              <>
                <circle className="gmap-pulse" r="7.6" fill="none" stroke="var(--accent)" strokeWidth="0.5"/>
                <circle className="gmap-pulse gmap-pulse--late" r="7.6" fill="none" stroke="var(--accent)" strokeWidth="0.5"/>
                <circle r="2" fill="var(--ink)" />
                <circle r="4.6" fill="none" stroke="var(--ink)" strokeWidth="0.3" opacity="0.3"/>
                <text x="3.4" y="-2.6" fontSize="2.6" fill="var(--ink)" fontFamily="var(--font-mono)" letterSpacing="0.08em">ACCRA &middot; HQ</text>
              </>
            ) : (
              <>
                <circle r="1.2" fill="var(--accent)" stroke="#fff" strokeWidth="0.4" />
                <text x={dx} y={dy} textAnchor={anchor} fontSize="2.1" fill="var(--ink-2)" fontFamily="var(--font-mono)" letterSpacing="0.08em">{c.name.toUpperCase()}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}


export { Area };
