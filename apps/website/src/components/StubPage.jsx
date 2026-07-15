'use client';
import React from 'react';
import { Nav } from './Nav';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — shared layout for simple standalone pages (blog, careers, etc.).
// Content is CMS-driven when a `cmsKey` is given (falls back to props).

function StubPage({ eyebrow, title, body, home = '/', cmsKey }) {
  const { content, editMode } = useCmsContent(cmsKey || 'noop', { eyebrow, title, body });
  const c = content || { eyebrow, title, body };
  const bind = (p) => (cmsKey ? cmsBind(editMode, cmsKey, p) : {});

  return (
    <React.Fragment>
      <Nav home={home} />
      <main style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', padding: '160px 0 100px' }}>
        <div className="wrap" style={{ maxWidth: 760, textAlign: 'center' }}>
          <div className="h-eyebrow" style={{ display: 'block', marginBottom: 20 }} {...bind('eyebrow')}>{c.eyebrow ?? eyebrow}</div>
          <h1 className="display-2" style={{ margin: 0 }} {...bind('title')}>{c.title ?? title}</h1>
          <p className="h-lead" style={{ margin: '24px auto 0', maxWidth: '46ch' }} {...bind('body')}>{c.body ?? body}</p>
          <div style={{ marginTop: 36, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="btn" href={home}>Back to homepage</a>
            <a className="btn btn-outline" href="/assessment">Book a pool assessment</a>
          </div>
          <div className="chip" style={{ marginTop: 40 }}>
            <span className="chip-dot" /> Page coming soon
          </div>
        </div>
      </main>
      <footer style={{ borderTop: '1px solid var(--line)', padding: '32px 0' }}>
        <div className="wrap center" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          © PoolCare — Your Pool. Our Expertise. Smartly Managed.
        </div>
      </footer>
    </React.Fragment>
  );
}

export { StubPage };
