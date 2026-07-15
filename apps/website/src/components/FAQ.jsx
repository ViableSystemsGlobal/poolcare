'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — FAQ accordion. CMS: page.home → faq.

const FAQS = [
  { q: 'What makes PoolCare different?', a: 'PoolCare is a pool governance system, not just a cleaning service. Every visit follows a defined process — water testing, equipment checks, surface care and documented actions — and all service activity is tracked through the PoolCare app.' },
  { q: 'How do I choose between Flex, Premium, Premium Plus and Luxury Villa?', a: 'Every pool is assessed before a plan is assigned — we evaluate pool size, usage and system condition. Flex is service-only maintenance where you supply chemicals; Premium adds full water chemistry management for pools up to 60 m³; Premium Plus adds equipment and performance care for 60–120 m³ pools; Luxury Villa is elite water management for large villas and estates of 60 m³ and above.' },
  { q: 'What is included in the monthly service?', a: 'Every plan includes structured servicing, water testing, equipment monitoring and digital service reports in the app. Premium, Premium Plus and Luxury Villa also include treatment chemicals; on Flex you supply your own. Corrective and specialized work — such as green pool restoration, pump replacement or leak detection — is quoted separately.' },
  { q: 'How quickly do you respond to issues?', a: 'Response time depends on your plan. Flex and Premium include a 48-hour response for non-emergency technical issues; Premium Plus has a 24–36 hour priority response; Luxury Villa carries VIP priority with a target response within 12 working hours. Emergencies are assessed separately.' },
  { q: 'Do you service salt-water pools?', a: 'Yes. Our Premium Plus plan is built for salt chlorination and automated dosing systems, and includes salt cell inspection and calibration as part of its advanced care.' },
  { q: 'Can you manage commercial and hospitality pools?', a: 'Yes. PoolCare is designed for pools that require structure and reliability — including luxury homes and villas, gated communities, guest houses and hospitality properties.' },
  { q: 'Where do you operate?', a: 'PoolCare provides pool maintenance and water management across Accra and nearby communities — including East Legon, Cantonments, Trasacco and Spintex — and also serves Kumasi and Takoradi.' },
];

function FAQ() {
  const { content, editMode } = useCmsContent('page.home', {});
  const s = content?.faq || {};
  const items = s.items || FAQS;
  const bind = (p) => cmsBind(editMode, 'page.home', `faq.${p}`);
  const [open, setOpen] = React.useState(0);

  return (
    <section className="section" id="faq" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <div className="r-grid-2-faq">
          <div className="stick-cover" style={{ position: 'sticky', top: 100, '--cover-bg': 'var(--paper)' }}>
            <span className="h-eyebrow" {...bind('eyebrow')}>{s.eyebrow || 'FAQ'}</span>
            <h2 className="display-2" style={{ margin: '16px 0 24px' }}>
              <span {...bind('titlePre')}>{s.titlePre || 'Common'}</span> <span className="serif-italic muted" {...bind('titleAccent')}>{s.titleAccent || 'questions,'}</span><br/>
              <span {...bind('titleEnd')}>{s.titleEnd || 'direct answers.'}</span>
            </h2>
            <p className="h-lead" style={{ maxWidth: '32ch' }}>
              Don&rsquo;t see yours? Call us at <strong style={{ color: 'var(--ink)', fontWeight: 500 }} {...bind('contactPhone')}>{s.contactPhone || '(+233) 50 622 6222'}</strong> or email <span {...bind('contactEmail')}>{s.contactEmail || 'info@poolcare.africa'}</span>.
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--line)' }}>
            {items.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                  <button onClick={() => setOpen(isOpen ? -1 : i)}
                    style={{ all: 'unset', cursor: 'default', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, width: '100%', padding: '28px 0' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 2vw, 28px)', letterSpacing: '-0.02em', lineHeight: 1.2, fontWeight: 500, paddingRight: 24 }} {...bind(`items.${i}.q`)}>
                      {f.q}
                    </span>
                    <span style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid var(--line)', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                      <svg width="14" height="14" viewBox="0 0 14 14"><path d={isOpen ? 'M3 7h8' : 'M3 7h8M7 3v8'} stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>
                    </span>
                  </button>
                  <div style={{ overflow: 'hidden', maxHeight: isOpen ? 400 : 0, transition: 'max-height .25s ease' }}>
                    <p style={{ margin: 0, paddingBottom: 28, color: 'var(--ink-2)', fontSize: 16, lineHeight: 1.6, maxWidth: '64ch' }} {...bind(`items.${i}.a`)}>{f.a}</p>
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

export { FAQ };
