'use client';
import React from 'react';
import { Nav } from '@/components/Nav';
import { PageHero } from '@/components/PageHero';
import { Footer } from '@/components/Footer';
import { useCmsContent } from '@/lib/cms';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const FALLBACK = {
  eyebrow: 'Resources — Blog',
  title: 'Pool care tips & guides',
  body: 'Practical advice on water chemistry, equipment, and keeping your pool reliable year-round.',
};

function fmtDate(iso: any) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
}

export default function BlogClient() {
  const { content } = useCmsContent('page.blog', {});
  const c: any = content || FALLBACK;
  const [posts, setPosts] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/public/blog?type=article`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => { if (alive) setPosts(d.posts || []); })
      .catch(() => { if (alive) setPosts([]); });
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
          image="https://images.unsplash.com/photo-1572331165267-854da2b10ccc?w=2400&q=80&auto=format&fit=crop"
        />

        <section className="section">
          <div className="wrap">
            {posts === null ? (
              <div style={{ padding: '40px 0', color: 'var(--ink-3)' }}>Loading articles…</div>
            ) : posts.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink-3)' }}>
                <p className="h-lead" style={{ margin: 0 }}>No articles published yet — check back soon.</p>
              </div>
            ) : (
              <div className="r-grid-3" style={{ gap: 28 }}>
                {posts.map((p) => (
                  <a key={p.slug} href={`/blog/${p.slug}`} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'default' }}>
                    <div style={{ aspectRatio: '16 / 9', background: 'var(--surface-2)', overflow: 'hidden' }}>
                      {p.coverImage && <img src={p.coverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', flex: 1 }}>
                      {p.tags && p.tags[0] && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>{p.tags[0]}</div>
                      )}
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{p.title}</div>
                      {p.excerpt && <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, flex: 1 }}>{p.excerpt}</p>}
                      <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--ink-3)' }}>{fmtDate(p.publishedAt)} · {p.author || 'PoolCare'}</div>
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
