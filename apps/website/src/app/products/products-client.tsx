'use client';
import React from 'react';
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { useCmsContent, cmsBind } from "@/lib/cms";

// Products showcase (client). Branded PoolCare chemicals, grouped by category.
// Showcase only — click a product to open a details modal. CMS: page.products.

const FALLBACK = {
  hero: {
    eyebrow: "Our Products",
    title: "PoolCare",
    titleAccent: "branded chemicals.",
    lead: "Our own line of professional pool chemicals — the same products our technicians trust on every visit.",
  },
  products: [],
};

export default function ProductsClient() {
  const { content, editMode } = useCmsContent("page.products", FALLBACK);
  const hero = content?.hero || FALLBACK.hero;
  const products = content?.products || FALLBACK.products;
  const bind = (path: string) => cmsBind(editMode, "page.products", path);
  const [active, setActive] = React.useState<any>(null); // selected product (modal)

  // Group products by category, preserving first-seen order.
  const groups: string[] = [];
  const byCat = new Map<string, any[]>();
  products.forEach((p: any, i: number) => {
    const cat = p.category || "Products";
    if (!byCat.has(cat)) { byCat.set(cat, []); groups.push(cat); }
    byCat.get(cat)!.push({ ...p, _i: i });
  });

  return (
    <>
      <Nav home="/" />
      <main>
        {/* Hero */}
        <section className="section" style={{ paddingTop: 140, paddingBottom: 24, background: 'var(--paper)' }}>
          <div className="wrap">
            <span className="h-eyebrow" {...bind('hero.eyebrow')}>{hero.eyebrow || 'Our Products'}</span>
            <h1 className="display-1" style={{ margin: '16px 0 0', maxWidth: '16ch' }}>
              <span {...bind('hero.title')}>{hero.title}</span>{' '}
              <span className="serif-italic muted" {...bind('hero.titleAccent')}>{hero.titleAccent}</span>
            </h1>
            <p className="h-lead" style={{ margin: '24px 0 0', maxWidth: '60ch' }} {...bind('hero.lead')}>{hero.lead}</p>
          </div>
        </section>

        {/* Category groups */}
        <section className="section" style={{ paddingTop: 16 }}>
          <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
            {groups.length === 0 && (
              <p style={{ color: 'var(--ink-3)' }}>Products coming soon.</p>
            )}
            {groups.map((cat) => (
              <div key={cat}>
                <div className="h-eyebrow" style={{ marginBottom: 18 }}>{cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
                  {(byCat.get(cat) || []).map((p: any) => (
                    <button
                      key={p._i}
                      onClick={() => { if (!editMode) setActive(p); }}
                      style={{
                        all: 'unset', cursor: editMode ? 'default' : 'pointer', display: 'flex', flexDirection: 'column',
                        border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: '#fff', transition: 'box-shadow .2s, transform .2s',
                      }}
                      onMouseOver={(e) => { if (!editMode) { e.currentTarget.style.boxShadow = '0 16px 40px rgba(26,61,42,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                      onMouseOut={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                    >
                      <div style={{ aspectRatio: '4 / 3', background: '#fff', overflow: 'hidden' }}>
                        {p.image ? <img loading="lazy" decoding="async" src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12, boxSizing: 'border-box' }} {...bind(`products.${p._i}.image`)} /> : null}
                      </div>
                      <div style={{ padding: 16 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, letterSpacing: '-0.01em', fontWeight: 500, color: 'var(--ink)' }} {...bind(`products.${p._i}.name`)}>{p.name}</div>
                        {p.blurb && <div style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }} {...bind(`products.${p._i}.blurb`)}>{p.blurb}</div>}
                        {!editMode && (
                          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            View details
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Showcase note */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', borderTop: '1px solid var(--line)', paddingTop: 20 }}>
              Products are supplied and applied as part of PoolCare service plans. Talk to us about what your pool needs.
            </p>
          </div>
        </section>
      </main>
      <Footer home="/" />

      {active && <ProductModal product={active} onClose={() => setActive(null)} />}
    </>
  );
}

function ProductModal({ product: p, onClose }: { product: any; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,15,32,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 22, maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.28)' }}
      >
        {p.image && (
          <div style={{ aspectRatio: '16 / 10', background: '#fff', overflow: 'hidden', position: 'relative', borderBottom: '1px solid var(--line)' }}>
            <img loading="lazy" decoding="async" src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 16, boxSizing: 'border-box' }} />
            <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 999, border: 0, background: 'rgba(255,255,255,0.92)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
        )}
        <div style={{ padding: '24px 26px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            {p.category && <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', padding: '4px 10px', borderRadius: 999 }}>{p.category}</span>}
            {p.form && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{p.form}</span>}
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.02em', fontWeight: 500, color: 'var(--ink)', margin: '4px 0 0' }}>{p.name}</h2>
          {p.description && <p style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--ink-2)', margin: '14px 0 0' }}>{p.description}</p>}

          {(p.size || p.form || p.dosage) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '22px 0 0' }}>
              {p.size && <Spec label="Size / packaging" value={p.size} />}
              {p.form && <Spec label="Form" value={p.form} />}
              {p.dosage && <Spec label="Dosage / application" value={p.dosage} wide />}
            </div>
          )}

          {Array.isArray(p.benefits) && p.benefits.length > 0 && (
            <div style={{ margin: '22px 0 0' }}>
              <div className="h-eyebrow" style={{ marginBottom: 10 }}>Key benefits</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.benefits.map((b: string, i: number) => (
                  <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14.5, color: 'var(--ink-2)' }}>
                    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="11" cy="11" r="10" fill="var(--accent)" /><path d="M6 11.5l3.2 3.2L16 8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.safety && (
            <div style={{ margin: '22px 0 0', padding: '12px 14px', borderRadius: 12, background: 'var(--track)', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>Safety:</strong> {p.safety}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}
