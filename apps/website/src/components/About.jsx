'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — About body. CMS: page.about → body.

const FALLBACK = {
  eyebrow: 'About our company',
  lead: 'A swimming pool is not just water. It is a system that requires',
  leadAccent: ' consistency, control and precision.',
  operateEyebrow: 'How we operate',
  operateTitle: "We don't just maintain pools, we manage them.",
  operateText: 'We manage pools through disciplined systems, not guesswork. Every service is structured to maintain water balance, protect equipment, and deliver consistent results over time.',
  approachEyebrow: 'Our approach',
  approachTitle: 'Built on discipline, not assumption.',
  approachText: 'We test, balance and track water conditions to maintain long-term stability. Our focus:',
  focus: ['Prevention over repair', 'Data over assumption', 'Discipline over shortcuts', 'Long-term protection'],
  whyEyebrow: 'Why PoolCare — what sets us apart',
  why: [
    { n: '01', t: 'Documented every visit', d: 'Each service is logged with checks, testing and the actions taken.' },
    { n: '02', t: 'Water chemistry managed professionally', d: 'Tested, balanced and tracked to maintain long-term stability.' },
    { n: '03', t: 'Structured technician workflows', d: 'Trained technicians operate to a defined process, not guesswork.' },
    { n: '04', t: 'Equipment monitoring & reporting', d: 'Condition is inspected and reported so issues surface early.' },
  ],
  ctaTitle: 'Ready for professional pool management?',
  ctaText: 'Book a pool assessment and let our team evaluate your system, water condition and service requirements.',
  ctaLabel: 'Book a pool assessment',
};

function About() {
  const { content, editMode } = useCmsContent('page.about', {});
  const b = content?.body || FALLBACK;
  const focus = b.focus || FALLBACK.focus;
  const why = b.why || FALLBACK.why;
  const bind = (p) => cmsBind(editMode, 'page.about', `body.${p}`);

  return (
    <section className="section" id="about">
      <div className="wrap">
        <span className="h-eyebrow" {...bind('eyebrow')}>{b.eyebrow}</span>
        <h2 className="display-3" style={{ margin: '20px 0 0', maxWidth: '22ch' }}>
          <span {...bind('lead')}>{b.lead}</span>
          <span className="serif-italic muted" {...bind('leadAccent')}>{b.leadAccent}</span>
        </h2>

        <div className="r-grid-2" style={{ marginTop: 72 }}>
          <div>
            <div className="h-eyebrow" style={{ marginBottom: 14 }} {...bind('operateEyebrow')}>{b.operateEyebrow}</div>
            <h3 className="display-3" style={{ margin: 0, fontSize: 'clamp(26px, 2.6vw, 36px)' }} {...bind('operateTitle')}>{b.operateTitle}</h3>
            <p className="h-lead" style={{ marginTop: 18, maxWidth: '42ch' }} {...bind('operateText')}>{b.operateText}</p>
          </div>
          <div>
            <div className="h-eyebrow" style={{ marginBottom: 14 }} {...bind('approachEyebrow')}>{b.approachEyebrow}</div>
            <h3 className="display-3" style={{ margin: 0, fontSize: 'clamp(26px, 2.6vw, 36px)' }} {...bind('approachTitle')}>{b.approachTitle}</h3>
            <p className="h-lead" style={{ marginTop: 18, maxWidth: '42ch' }} {...bind('approachText')}>{b.approachText}</p>
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }} {...bind('focus')}>
              {focus.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, color: 'var(--ink-2)' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2.5 5.5L4.5 7.5L8.5 3.5" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 88 }}>
          <div className="h-eyebrow" style={{ marginBottom: 28 }} {...bind('whyEyebrow')}>{b.whyEyebrow}</div>
          <div className="r-grid-4-cards">
            {why.map((w, i) => (
              <div key={i} className="card" style={{ padding: 28 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{w.n}</div>
                <div style={{ marginTop: 18, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.2 }} {...bind(`why.${i}.t`)}>{w.t}</div>
                <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.55 }} {...bind(`why.${i}.d`)}>{w.d}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 72, padding: '40px 36px', background: 'var(--ink)', color: '#fff', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <h3 className="display-3" style={{ margin: 0, color: '#fff', fontSize: 'clamp(24px, 2.4vw, 34px)' }} {...bind('ctaTitle')}>{b.ctaTitle}</h3>
            <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.7)', maxWidth: '48ch' }} {...bind('ctaText')}>{b.ctaText}</p>
          </div>
          <a className="btn btn-light btn-lg" href="/assessment" {...bind('ctaLabel')}>{b.ctaLabel}</a>
        </div>
      </div>
    </section>
  );
}

export { About };
