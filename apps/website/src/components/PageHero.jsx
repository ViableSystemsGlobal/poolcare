'use client';
import React from 'react';

// PoolCare — PageHero: a compact photo hero for interior pages.
// Smaller sibling of the homepage Hero — no CTAs, no cards, fixed shorter
// height. Top padding clears the fixed nav.

function PageHero({ eyebrow, title, subtitle, image }) {
  return (
    <section style={{
      padding: '88px 16px 16px',
      background: '#fff',
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: 'min(46vh, 420px)',
        minHeight: 300,
        borderRadius: 14,
        overflow: 'hidden',
        background: '#0d2419',
        isolation: 'isolate',
      }}>
        {image && (
          <img
            src={image}
            alt=""
            fetchpriority="high"
            decoding="async"
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              filter: 'saturate(0.92) contrast(1.02)',
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        {/* Vignette for text legibility */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(5,15,32,0.55) 0%, rgba(5,15,32,0.20) 45%, rgba(5,15,32,0.70) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Centered content */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
          color: '#fff', textAlign: 'center',
        }}>
          {eyebrow && (
            <span className="chip chip-dark chip-dot" style={{ marginBottom: 20 }}>
              {eyebrow}
            </span>
          )}
          <h1 className="display-3" style={{ margin: 0, color: '#fff', maxWidth: '18ch' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="h-lead" style={{
              margin: '20px 0 0',
              maxWidth: 540,
              color: 'rgba(255,255,255,0.86)',
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}


export { PageHero };
