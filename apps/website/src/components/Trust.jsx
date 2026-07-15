'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Trust band. Content is CMS-driven (page.home → trust.stats).

const FALLBACK = [
  { eyebrow: 'Based in', big: 'Accra', sub: 'Mempeasem, Ghana' },
  { eyebrow: 'Service plans', big: '4', sub: 'Flex to Luxury Villa' },
  { eyebrow: 'VIP response', big: '12h', sub: 'Luxury Villa priority' },
  { eyebrow: 'Cities served', big: '3', sub: 'Accra · Kumasi · Takoradi' },
];

function Trust() {
  const { content, editMode } = useCmsContent('page.home', {});
  const stats = content?.trust?.stats || FALLBACK;
  const bind = (i, f) => cmsBind(editMode, 'page.home', `trust.stats.${i}.${f}`);

  return (
    <section style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: 'var(--paper)' }}>
      <div className="wrap trust-band" style={{ padding: 'clamp(24px, 4vw, 40px) clamp(8px, 2vw, 32px)', display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: 0 }}>
        {stats.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Sep />}
            <Stat eyebrow={s.eyebrow} big={s.big} sub={s.sub}
              bindEyebrow={bind(i, 'eyebrow')} bindBig={bind(i, 'big')} bindSub={bind(i, 'sub')} />
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function Stat({ eyebrow, big, sub, bindEyebrow, bindBig, bindSub }) {
  return (
    <div className="trust-stat" style={{ padding: '8px clamp(8px, 1.5vw, 32px)', minWidth: 0, flex: 1 }}>
      <div className="h-eyebrow trust-eyebrow" style={{ marginBottom: 'clamp(8px, 1vw, 14px)' }} {...bindEyebrow}>{eyebrow}</div>
      <div className="trust-num" style={{ fontFamily: 'var(--font-display)', lineHeight: 1, letterSpacing: '-0.03em', fontWeight: 400, display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
        <span className="tabnum" {...bindBig}>{big}</span>
      </div>
      <div className="trust-sub" style={{ color: 'var(--ink-3)' }} {...bindSub}>{sub}</div>
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />;
}

export { Trust };
