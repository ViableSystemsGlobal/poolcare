'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — How it works (scroll-progress timeline). CMS: page.home → howItWorks.

const STEPS = [
  { n: '01', title: 'Assessment & evaluation', blurb: 'We assess your pool size, usage and system condition to determine the right management approach for your property.', detail: 'Pool size · usage · system condition' },
  { n: '02', title: 'Service plan assignment', blurb: 'Your pool is enrolled into a structured plan based on its specific requirements — Flex, Premium, Premium Plus or Luxury Villa.', detail: 'Flex · Premium · Premium Plus · Luxury Villa' },
  { n: '03', title: 'System-based servicing', blurb: 'Every visit follows a defined process: water testing, equipment checks, surface care and documented actions — executed by trained technicians.', detail: 'Testing · equipment checks · documented' },
  { n: '04', title: 'Monitoring & reporting', blurb: 'All service activity is tracked, reviewed and accessible through the PoolCare system — so you always know your pool’s condition.', detail: 'Tracked in the PoolCare app' },
];

function HowItWorks() {
  const { content, editMode } = useCmsContent('page.home', {});
  const s = content?.howItWorks || {};
  const steps = s.steps || STEPS;
  const bind = (p) => cmsBind(editMode, 'page.home', `howItWorks.${p}`);

  const railRef = React.useRef(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    const onScroll = () => {
      const el = railRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.8;
      const end = vh * 0.3;
      const span = start - end;
      const value = (start - rect.top) / span;
      setProgress(Math.max(0, Math.min(1, value)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);

  const stepProgress = (i) => {
    const t = 0.10 + (i * 0.78) / (steps.length - 1);
    return progress >= t ? 1 : 0;
  };

  return (
    <section className="section how-section" style={{ background: '#fff' }} id="how">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="h-eyebrow" {...bind('eyebrow')}>{s.eyebrow || 'How we work'}</span>
            <h2 className="display-2 section-head__title" style={{ marginTop: 16 }}>
              <span {...bind('title')}>{s.title || 'A structured approach'}</span><br/>
              <span className="serif-italic muted" {...bind('titleAccent')}>{s.titleAccent || 'to pool'}</span><span {...bind('titleEnd')}>{s.titleEnd || ' management.'}</span>
            </h2>
          </div>
          <p className="h-lead section-head__lead" {...bind('lead')}>
            {s.lead || 'We eliminate guesswork. Every pool is assessed, assigned a service structure, and managed through a system that ensures consistency and accountability.'}
          </p>
        </div>

        <div ref={railRef} className="how-rail">
          <div className="how-progress">
            <div className="how-progress__track" />
            <div className="how-progress__fill" style={{ '--p': `${progress * 100}%` }} />
          </div>

          <div className="how-steps">
            {steps.map((st, i) => {
              const active = stepProgress(i) > 0;
              return (
                <div key={i} className={'how-step' + (active ? ' is-active' : '')}>
                  <span className="how-step__node" aria-hidden="true">
                    <span className="how-step__node-num">{st.n}</span>
                  </span>
                  <div className="how-step__body">
                    <h3 className="how-step__title" {...bind(`steps.${i}.title`)}>{st.title}</h3>
                    <p className="how-step__blurb" {...bind(`steps.${i}.blurb`)}>{st.blurb}</p>
                    <div className="how-step__detail" {...bind(`steps.${i}.detail`)}>{st.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export { HowItWorks };
