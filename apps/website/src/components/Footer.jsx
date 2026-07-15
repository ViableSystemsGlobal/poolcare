'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Footer. Menus (columns/social/legal links) are CMS-driven from the
// global `site` doc → footer.*, with the constants below as offline fallbacks.
// Hrefs are root-absolute ("/#app", "/#services") so anchors resolve from any page.

const FOOTER_COLUMNS = [
  { title: 'Explore', items: [
    { label: 'Home',             href: '/' },
    { label: 'Services & Plans', href: '/services-plans' },
    { label: 'Products',         href: '/products' },
    { label: 'The App',          href: '/#app' },
    { label: 'About',            href: '/about' },
    { label: 'Contact',          href: '/contact' },
  ] },
  { title: 'Plans', items: [
    { label: 'Flex',          href: '/flex' },
    { label: 'Premium',       href: '/premium' },
    { label: 'Premium Plus',  href: '/premium-plus' },
    { label: 'Luxury Villa',  href: '/luxury-villa' },
    { label: 'Compare plans', href: '/services-plans' },
  ] },
  { title: 'Services', items: [
    { label: 'Routine maintenance',  href: '/#services' },
    { label: 'Water chemistry',      href: '/#services' },
    { label: 'Filtration & system',  href: '/#services' },
    { label: 'Equipment monitoring', href: '/#services' },
    { label: 'Specialized services', href: '/#services' },
  ] },
  { title: 'Legal', items: [
    { label: 'Disclaimer',         href: '/disclaimer' },
    { label: 'Privacy Policy',     href: '/privacy-policy' },
    { label: 'Terms & Conditions', href: '/terms' },
  ] },
];

const FOOTER_SOCIAL = [
  { label: 'Facebook', href: '#' },
  { label: 'Twitter',  href: '#' },
  { label: 'YouTube',  href: '#' },
];

const FOOTER_LEGAL = [
  { label: 'Disclaimer',         href: '/disclaimer' },
  { label: 'Privacy Policy',     href: '/privacy-policy' },
  { label: 'Terms & Conditions', href: '/terms' },
];

function Footer({ home = '' }) {
  const { content, editMode } = useCmsContent('site', {});
  const f = content?.footer || {};
  const bind = (p) => cmsBind(editMode, 'site', p);
  const columns = f.columns || FOOTER_COLUMNS;
  const social = f.social || FOOTER_SOCIAL;
  const legalLinks = f.legalLinks || FOOTER_LEGAL;

  return (
    <footer style={{
      background: '#fff',
      borderTop: '1px solid var(--line)',
      paddingTop: 80,
    }}>
      <div className="wrap">
        {/* Big closing line */}
        <div style={{
          paddingBottom: 80,
          borderBottom: '1px solid var(--line)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <h2 className="display-2" style={{ margin: 0, maxWidth: '14ch' }}>
              <span {...bind('footer.headline')}>{f.headline || 'Get your pool'}</span><br/>
              <span className="serif-italic muted" {...bind('footer.headlineAccent')}>{f.headlineAccent || 'smartly managed.'}</span>
            </h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a className="btn btn-lg" href="/assessment" {...bind('footer.ctaPrimary')}>{f.ctaPrimary || 'Book a pool assessment'}</a>
              <a className="btn btn-outline btn-lg" href="tel:+233506226222" {...bind('footer.ctaSecondary')}>{f.ctaSecondary || 'Call (+233) 50 622 6222'}</a>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="r-grid-footer" style={{
          padding: '64px 0 56px',
        }}>
          <div>
            <div style={{ marginBottom: 24 }}>
              <img src={f.logo || '/images/logo.png'} alt="PoolCare" style={{ height: 46, width: 'auto', display: 'block' }} {...bind('footer.logo')} />
            </div>
            <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink-3)', maxWidth: '34ch', lineHeight: 1.55 }} {...bind('footer.description')}>
              {f.description || 'Professional pool maintenance, repair, and installation services for homes, apartments, and commercial properties.'}
            </p>
            <div style={{ marginTop: 24, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7 }}>
              <div {...bind('footer.addressLine1')}>{f.addressLine1 || '44 Nii Obodaifio Street'}</div>
              <div {...bind('footer.addressLine2')}>{f.addressLine2 || 'Mempeasem, Accra'}</div>
              <div style={{ marginTop: 6 }}>
                <a href={`mailto:${f.email || 'info@poolcare.africa'}`} {...bind('footer.email')}>{f.email || 'info@poolcare.africa'}</a>
                {' · '}
                <a href="tel:+233506226222" {...bind('footer.phone')}>{f.phone || '(+233) 50 622 6222'}</a>
              </div>
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 18, fontSize: 13 }}>
              {social.map((s, i) => (
                <a key={i} href={s.href} style={{ color: 'var(--ink-2)', cursor: 'default' }}>{s.label}</a>
              ))}
            </div>
          </div>

          {columns.map((col, i) => (
            <Col key={i} title={col.title} items={col.items} />
          ))}
        </div>

        {/* Bottom row */}
        <div style={{
          padding: '24px 0 48px',
          borderTop: '1px solid var(--line)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 24, flexWrap: 'wrap',
          fontSize: 12.5, color: 'var(--ink-3)',
        }}>
          <span {...bind('footer.copyright')}>{f.copyright || '© 2026 Pool Care. All Rights Reserved.'}</span>
          <div style={{ display: 'flex', gap: 24 }}>
            {legalLinks.map((l, i) => (
              <a key={i} href={l.href} style={{ cursor: 'default' }}>{l.label}</a>
            ))}
          </div>
        </div>
      </div>

      {/* Giant wordmark */}
      <div style={{
        overflow: 'hidden',
        borderTop: '1px solid var(--line)',
        background: 'var(--paper)',
        padding: '40px 0 28px',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(80px, 22vw, 360px)',
          lineHeight: 0.85,
          letterSpacing: '-0.05em',
          fontWeight: 400,
          color: 'var(--ink)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          PoolCare<span style={{ color: 'var(--accent)' }}>.</span>
        </div>
      </div>
    </footer>
  );
}

function Col({ title, items }) {
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 18 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it, i) => (
          <a key={i} href={it.href} style={{ fontSize: 14.5, color: 'var(--ink)', cursor: 'default' }}>
            {it.label}
          </a>
        ))}
      </div>
    </div>
  );
}


export { Footer };
