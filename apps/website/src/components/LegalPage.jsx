'use client';
import React from 'react';
import { Footer } from './Footer';
import { Nav } from './Nav';
import { LEGAL_DOCS } from '../data/legal';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — shared layout for the legal pages (Disclaimer, Privacy Policy,
// Terms). Content is CMS-driven (page.<docKey>), falling back to LEGAL_DOCS.

function LegalPage({ docKey, home = '/' }) {
  const { content, editMode } = useCmsContent(`page.${docKey}`, {});
  const d = (content && content.title) ? content : LEGAL_DOCS[docKey];
  const bind = (p) => cmsBind(editMode, `page.${docKey}`, p);
  if (!d) return null;

  return (
    <React.Fragment>
      <Nav home={home} />
      <main>
        <section className="section" style={{ paddingTop: 160 }}>
          <div className="wrap">
            <span className="h-eyebrow" {...bind('eyebrow')}>{d.eyebrow}</span>
            <h1 className="display-2" style={{ margin: '20px 0 0', maxWidth: '18ch' }} {...bind('title')}>{d.title}</h1>
            <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--ink-3)', textTransform: 'uppercase' }} {...bind('updated')}>{d.updated}</div>

            <div className="r-grid-2-faq" style={{ marginTop: 56 }}>
              <div className="stick-cover" style={{ position: 'sticky', top: 100, '--cover-bg': '#fff' }}>
                <p className="h-lead" style={{ margin: 0, maxWidth: '34ch' }} {...bind('intro')}>{d.intro}</p>
                <a className="btn" href="/contact" style={{ marginTop: 24 }}>Contact us</a>
              </div>

              <div>
                {(d.sections || []).map((s, i) => (
                  <div key={i} style={{ paddingBottom: 32, marginBottom: 32, borderBottom: i < d.sections.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 2vw, 26px)', fontWeight: 500, letterSpacing: '-0.02em' }} {...bind(`sections.${i}.h`)}>{s.h}</h2>
                    {(s.p || []).map((para, j) => (
                      <p key={j} style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: '70ch' }} {...bind(`sections.${i}.p.${j}`)}>{para}</p>
                    ))}
                    {s.defs && (
                      <dl style={{ margin: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {s.defs.map(([term, def], k) => (
                          <div key={k} style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: '70ch' }}>
                            <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{term}</strong> — {def}
                          </div>
                        ))}
                      </dl>
                    )}
                    {s.list && (
                      <ul style={{ margin: '16px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {s.list.map((it, k) => (
                          <li key={k} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: '70ch' }}>
                            <span style={{ color: 'var(--accent)' }}>—</span>{it}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer home={home} />
    </React.Fragment>
  );
}

export { LegalPage, LEGAL_DOCS };
