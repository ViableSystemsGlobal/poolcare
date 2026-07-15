'use client';
import React from 'react';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare top nav — floating pill that condenses on scroll
//
// Menus are CMS-driven (the global `site` doc → nav.primary / nav.plans), with
// the constants below as offline fallbacks. Hrefs are root-absolute (e.g.
// "/#app", "/#quote") so section anchors resolve from any page. A primary item
// with a `menu` array renders as a dropdown (used for "Resources").

const NAV_PRIMARY = [
  { label: 'Services & Plans', href: '/services-plans' },
  { label: 'Products', href: '/products' },
  { label: 'PoolCare App', href: '/#app' },
  { label: 'Resources', href: '#', menu: [
    { label: 'Blog',         desc: 'Pool care tips & guides', href: '/blog' },
    { label: 'Case Studies', desc: 'Real PoolCare projects',  href: '/case-studies' },
    { label: 'Careers',      desc: 'We’re hiring',            href: '/careers' },
    { label: 'Get a quote',  desc: 'Tailored quote by email', href: '/#quote' },
  ] },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

const NAV_PLANS = [
  { label: 'All plans',    href: '/services-plans' },
  { label: 'Flex',         href: '/flex' },
  { label: 'Premium',      href: '/premium' },
  { label: 'Premium Plus', href: '/premium-plus' },
  { label: 'Luxury Villa', href: '/luxury-villa' },
];

function useIsMobile(bp = 880) {
  // Must start false to match the server render (no `window` there). The real
  // viewport is resolved in the effect below, after hydration — otherwise a
  // narrow client first-render would mismatch the server and break hydration.
  const [is, setIs] = React.useState(false);
  React.useEffect(() => {
    const onResize = () => setIs(window.innerWidth <= bp);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return is;
}

function Nav({ home = '' }) {
  const { content, editMode } = useCmsContent('site', {});
  const navc = content?.nav || {};
  const logo = navc.logo || '/images/logo.png';
  const ctaLabel = navc.ctaLabel || 'Book a pool assessment';
  const primary = navc.primary || NAV_PRIMARY;
  const plans = navc.plans || NAV_PLANS;
  const bind = (p) => cmsBind(editMode, 'site', p);
  const [open, setOpen] = React.useState(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const isMobile = useIsMobile(880);

  React.useEffect(() => {
    const onScroll = () => {
      // The hero is position:sticky so its own rect stays pinned at top:0.
      // Instead, watch the SECOND section (Trust band): floating nav appears
      // once it scrolls up past the top of the viewport.
      const sections = document.querySelectorAll('main > section');
      const next = sections[1];
      if (next) {
        setScrolled(next.getBoundingClientRect().top <= 24);
      } else {
        setScrolled(window.scrollY > 60);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  // Close any open dropdown when clicking outside it or pressing Escape.
  // The trigger buttons stopPropagation, so opening one doesn't instantly close it.
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = () => setOpen(null);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Outer container: fixed, sits with margin from edges.
  // Responsive padding/width/gap live in CSS (.nav-outer / .nav-pill +
  // .is-scrolled) so the layout is correct at first paint without JS.
  const outerStyle = {
    position: 'fixed',
    top: 0,
    left: 0, right: 0,
    zIndex: 50,
    display: 'flex',
    justifyContent: scrolled ? 'center' : 'stretch',
    pointerEvents: 'none',
    transition: 'padding 480ms cubic-bezier(0.22, 0.7, 0.18, 1)',
  };

  // Inner pill chrome — full-width bar at top, floating pill when scrolled.
  const pillStyle = {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    borderRadius: scrolled ? 22 : 0,
    background: scrolled || mobileOpen ? 'rgba(255,255,255,0.92)' : 'transparent',
    backdropFilter: scrolled ? 'blur(24px) saturate(160%)' : 'none',
    WebkitBackdropFilter: scrolled ? 'blur(24px) saturate(160%)' : 'none',
    border: scrolled ? '1px solid rgba(26,61,42,0.08)' : '1px solid transparent',
    boxShadow: scrolled
      ? '0 16px 40px rgba(26,61,42,0.10), 0 2px 6px rgba(26,61,42,0.04)'
      : 'none',
    color: 'var(--ink)',
    transform: scrolled ? 'translateY(0)' : 'translateY(0)',
    // Stagger: position/size eases quickly, chrome (bg, shadow, radius) lingers slightly
    transition: [
      'width 520ms cubic-bezier(0.22, 0.7, 0.18, 1)',
      'padding 520ms cubic-bezier(0.22, 0.7, 0.18, 1)',
      'border-radius 520ms cubic-bezier(0.22, 0.7, 0.18, 1)',
      'background 320ms ease-out 80ms',
      'box-shadow 320ms ease-out 80ms',
      'border-color 320ms ease-out 80ms',
      'backdrop-filter 320ms ease-out 80ms',
    ].join(', '),
    willChange: 'width, padding, border-radius, background, box-shadow',
  };

  return (
    <header className={'nav-outer' + (scrolled ? ' is-scrolled' : '')} style={outerStyle}>
      <div className={'nav-pill' + (scrolled ? ' is-scrolled' : '')} style={pillStyle}>
        {/* Logo */}
        <a href={home || '#'} style={{
          display: 'flex', alignItems: 'center',
          flexShrink: 0,
        }}>
          <img className="nav-logo" src={logo} alt="PoolCare" {...bind('nav.logo')} />
        </a>

        {/* Desktop nav links — center (hidden under 880px via CSS). Data-driven
            from nav.primary; an item with a `menu` array is a dropdown. */}
        <nav className="nav-desktop">
          {primary.map((item, i) => item.menu && item.menu.length ? (
            <NavItem key={i} label={item.label} hasMenu open={open === i} onOpen={() => setOpen(open === i ? null : i)}>
              <NavMenu items={item.menu} />
            </NavItem>
          ) : (
            <NavItem key={i} label={item.label} href={item.href} />
          ))}
        </nav>

        {/* Right: desktop CTA + mobile hamburger; CSS shows the right one. */}
        <button
          className="nav-hamburger"
          onClick={() => setMobileOpen(o => !o)}
          style={{
            // NB: no `all: unset` here — it would reset `display` inline and
            // override the .nav-hamburger CSS that hides this on desktop.
            appearance: 'none', WebkitAppearance: 'none',
            border: 0, margin: 0, padding: 0,
            cursor: 'default',
            marginLeft: 'auto',
            width: 44, height: 44, borderRadius: 999,
            background: 'var(--ink)', color: '#fff',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
          aria-label="Open menu"
        >
          {mobileOpen ? (
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          ) : (
            <svg width="18" height="14" viewBox="0 0 18 14"><path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          )}
        </button>
        <a className="btn nav-cta" href="/assessment" style={{
          background: 'var(--ink)', color: '#fff',
          height: scrolled ? 48 : 52,
          padding: scrolled ? '0 22px' : '0 26px',
          fontSize: 15,
          borderRadius: scrolled ? 14 : 999,
          transition: 'all 260ms ease',
        }} {...bind('nav.ctaLabel')}>
          {ctaLabel}
        </a>
      </div>

      {/* Mobile sheet — full screen drawer */}
      {isMobile && mobileOpen && (
        <MobileSheet onClose={() => setMobileOpen(false)} primary={primary} plans={plans} ctaLabel={ctaLabel} />
      )}
    </header>
  );
}

function NavItem({ label, href, hasMenu, open, onOpen, children }) {
  const itemStyle = {
    all: 'unset',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    height: 40, padding: '0 14px',
    fontSize: 14.5, letterSpacing: '-0.01em', fontWeight: 500,
    cursor: 'default', borderRadius: 999,
    color: 'inherit', opacity: 0.86,
  };
  return (
    <div style={{ position: 'relative' }}>
      {hasMenu ? (
        <button onClick={(e) => { e.stopPropagation(); onOpen(); }} style={itemStyle}>
          {label}
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', opacity: 0.6 }}>
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <a href={href} style={itemStyle}>{label}</a>
      )}
      {hasMenu && open && children}
    </div>
  );
}

function NavMenu({ items }) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: 'absolute', top: 48, left: 0,
      width: 320,
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 18,
      padding: 8,
      boxShadow: '0 24px 64px rgba(26,61,42,0.14)',
      color: 'var(--ink)',
    }}>
      {items.map((it, i) => (
        <a key={i} href={it.href} style={{ display: 'block', padding: '12px 14px', borderRadius: 12, cursor: 'default' }}
           onMouseOver={(e)=>e.currentTarget.style.background='var(--track)'}
           onMouseOut={(e)=>e.currentTarget.style.background='transparent'}>
          <div style={{ fontWeight: 500, fontSize: 15, letterSpacing: '-0.01em' }}>{it.label}</div>
          {it.desc && <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{it.desc}</div>}
        </a>
      ))}
    </div>
  );
}

function MobileSheet({ onClose, primary = NAV_PRIMARY, plans = NAV_PLANS, ctaLabel = 'Book a pool assessment' }) {
  // Derive the sheet from the same CMS-driven nav data: top-level links (minus
  // the dropdown entry) become "Menu", and the dropdown's items become "Resources".
  const resources = (primary.find((i) => i.menu && i.menu.length)?.menu) || [];
  const groups = [
    { label: 'Menu', items: primary.filter((i) => !(i.menu && i.menu.length)) },
    { label: 'Plans', items: plans },
    { label: 'Resources', items: resources },
  ].filter((g) => g.items.length);
  return (
    <div style={{
      position: 'fixed',
      top: 84, left: 12, right: 12, bottom: 12,
      // Parent <header> sets pointerEvents:none; re-enable here so links are
      // tappable and the sheet scrolls (otherwise taps/scroll pass through).
      pointerEvents: 'auto',
      background: '#fff',
      zIndex: 49,
      overflowY: 'auto',
      padding: '24px 20px 40px',
      borderRadius: 24,
      boxShadow: '0 24px 64px rgba(26,61,42,0.14)',
      border: '1px solid var(--line)',
      animation: 'sheetIn 240ms ease',
    }}>
      <style>{`@keyframes sheetIn { from { opacity: 0; transform: translateY(-8px);} to {opacity:1; transform:none;} }`}</style>
      {groups.map(g => (
        <div key={g.label} style={{ marginBottom: 28 }}>
          <div className="h-eyebrow" style={{ marginBottom: 8 }}>{g.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {g.items.map((it) => (
              <a key={it.label} href={it.href} onClick={onClose} style={{
                cursor: 'default',
                padding: '12px 0',
                borderBottom: '1px solid var(--line-2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontFamily: 'var(--font-display)',
                fontSize: 22, letterSpacing: '-0.02em', fontWeight: 500,
              }}>
                <span>{it.label}</span>
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            ))}
          </div>
        </div>
      ))}
      <a className="btn btn-lg" href="/assessment" onClick={onClose} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
        {ctaLabel}
      </a>
      <div style={{
        marginTop: 20, textAlign: 'center',
        fontSize: 13, color: 'var(--ink-3)',
      }}>
        Call us · <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>(+233) 50 622 6222</strong>
      </div>
    </div>
  );
}

function Logo({ color = "#1a3d2a", size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="0" y="0" width="28" height="28" rx="7" fill={color} />
      <path d="M9 18.2c0-2.6 2.2-4.5 5-7.7 2.8 3.2 5 5.1 5 7.7a5 5 0 1 1-10 0z" fill="#fff" />
      <circle cx="14" cy="18.4" r="1.6" fill={color} opacity="0.25" />
    </svg>
  );
}




export { Nav, Logo, useIsMobile };
