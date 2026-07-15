'use client';
import React from 'react';
import { Nav } from '@/components/Nav';
import { PageHero } from '@/components/PageHero';
import { Footer } from '@/components/Footer';
import { useCmsContent } from '@/lib/cms';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const FALLBACK = {
  eyebrow: 'Resources — Case Studies',
  title: 'Real PoolCare projects',
  body: 'See how we restored and now manage pools for villas, gated communities, and hospitality properties across Accra.',
};

export default function CaseStudiesClient() {
  const { content } = useCmsContent('page.case-studies', {});
  const c = content || FALLBACK;
  const [items, setItems] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/public/blog?type=case-study`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => { if (alive) setItems(d.posts || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <Nav home="/" />
      <main>
        <PageHero
          eyebrow={c.eyebrow || FALLBACK.eyebrow}
          title={c.title || FALLBACK.title}
          subtitle={c.body || FALLBACK.body}
          image="https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=2400&q=80&auto=format&fit=crop"
        />

        <section className="section">
          <div className="wrap">
            {items === null ? (
              <div style={{ padding: '40px 0', color: 'var(--ink-3)' }}>Loading case studies…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink-3)' }}>
                <p className="h-lead" style={{ margin: 0 }}>No case studies published yet — check back soon.</p>
              </div>
            ) : (
              <div className="r-grid-3" style={{ gap: 28 }}>
                {items.map((p) => (
                  <a key={p.slug} href={`/case-studies/${p.slug}`} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'default' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: (p.beforeImage && p.afterImage) ? '1fr 1fr' : '1fr', aspectRatio: '16 / 9', background: 'var(--surface-2)' }}>
                      {p.beforeImage && p.afterImage ? (
                        <>
                          <div style={{ position: 'relative', overflow: 'hidden' }}>
                            <img src={p.beforeImage} alt="Before" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(10,31,58,0.8)', color: '#fff', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 999 }}>Before</span>
                          </div>
                          <div style={{ position: 'relative', overflow: 'hidden' }}>
                            <img src={p.afterImage} alt="After" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.92)', color: 'var(--ink)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 999 }}>After</span>
                          </div>
                        </>
                      ) : p.coverImage ? (
                        <img src={p.coverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : null}
                    </div>
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', flex: 1 }}>
                      {p.client && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>{p.client}</div>}
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{p.title}</div>
                      {p.excerpt && <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, flex: 1 }}>{p.excerpt}</p>}
                      {p.outcome && <div style={{ marginTop: 14, fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>{p.outcome}</div>}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer home="/" />
    </>
  );
}
