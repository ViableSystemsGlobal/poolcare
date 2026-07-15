'use client';
import React from 'react';
import { submitLead } from '../lib/submit-lead';
import { Footer } from './Footer';
import { Nav } from './Nav';
import { PageHero } from './PageHero';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Contact page. Content (contact details, form fields, service
// areas, services) reproduced from the site content archive.

const SERVICE_TYPES = ['Pool Repairs', 'Pool Maintenance', 'Water Treatment'];
const POOL_TYPES = [
  'Infinity pool with Trough',
  'Infinity pool with Balance Tank',
  'Skimmer pool',
  'Skimmerless',
];
const SERVICE_AREAS = ['Accra', 'East Legon', 'Cantonments', 'Trasacco', 'Spintex'];
const HELP_WITH = [
  'Pool Equipment Repair',
  'Pool Restoration & Deep Cleaning',
  'Equipment Inspection & Servicing',
  'Pool System Monitoring',
  'Water Chemistry Management',
];

function ContactPage({ home = '/' }) {
  const { content, editMode } = useCmsContent('page.contact', {});
  const hero = content?.hero || { eyebrow: 'Contact', title: 'Get in touch.', subtitle: 'From cloudy water to equipment issues, our team is ready to help solve your pool maintenance needs.', image: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=2400&q=80&auto=format&fit=crop' };
  const cd = content?.contactDetails || { phone: '(+233) 50 622 6222', phoneHref: 'tel:+233506226222', email: 'info@poolcare.africa', emailHref: 'mailto:info@poolcare.africa', office: '44 Nii Obodaifio Street, Mempeasem, Accra' };
  const areas = content?.serviceAreas || { heading: 'Service areas', items: SERVICE_AREAS, note: 'Professional pool services across Accra — and Kumasi & Takoradi.' };
  const help = content?.help || { heading: 'What we help with', items: HELP_WITH };
  const form = content?.form || { heading: 'Send us a message' };
  const bind = (p) => cmsBind(editMode, 'page.contact', p);

  return (
    <React.Fragment>
      <Nav home={home} />
      <main>
        <PageHero eyebrow={hero.eyebrow} title={hero.title} subtitle={hero.subtitle} image={hero.image} />

        <section className="section">
          <div className="wrap">
            <div className="r-grid-2-faq" style={{ alignItems: 'flex-start' }}>
              {/* Left — direct contact + areas */}
              <div>
                <span className="h-eyebrow">Direct contact</span>
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <ContactRow label="Phone" value={cd.phone} href={cd.phoneHref} bind={bind('contactDetails.phone')} />
                  <ContactRow label="Email" value={cd.email} href={cd.emailHref} bind={bind('contactDetails.email')} />
                  <ContactRow label="Office" value={cd.office} bind={bind('contactDetails.office')} />
                </div>

                <div style={{ marginTop: 40 }}>
                  <span className="h-eyebrow" {...bind('serviceAreas.heading')}>{areas.heading}</span>
                  <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }} {...bind('serviceAreas.items')}>
                    {(areas.items || []).map((a, i) => (
                      <span key={i} className="chip" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-sans)', fontSize: 13 }}>{a}</span>
                    ))}
                  </div>
                  <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-3)' }} {...bind('serviceAreas.note')}>
                    {areas.note}
                  </p>
                </div>

                <div style={{ marginTop: 40 }}>
                  <span className="h-eyebrow" {...bind('help.heading')}>{help.heading}</span>
                  <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }} {...bind('help.items')}>
                    {(help.items || []).map((s, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, color: 'var(--ink-2)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right — form */}
              <ContactForm heading={form.heading} headingBind={bind('form.heading')} />
            </div>
          </div>
        </section>
      </main>
      <Footer home={home} />
    </React.Fragment>
  );
}

function ContactRow({ label, value, href, bind }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{label}</div>
      {href ? (
        <a href={href} style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 4, display: 'inline-block' }} {...bind}>{value}</a>
      ) : (
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 4 }} {...bind}>{value}</div>
      )}
    </div>
  );
}

function ContactForm({ heading = 'Send us a message', headingBind }) {
  const [form, setForm] = React.useState({
    name: '', email: '', phone: '',
    serviceType: 'Pool Maintenance',
    poolType: 'Skimmer pool',
    size: '', message: '', agree: false,
  });
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const update = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.agree) return;
    setError(null);
    setSubmitting(true);
    try {
      const noteParts = [];
      if (form.serviceType) noteParts.push(`Service: ${form.serviceType}`);
      if (form.poolType) noteParts.push(`Pool type: ${form.poolType}`);
      if (form.size) noteParts.push(`Size: ${form.size}`);
      if (form.message) noteParts.push(form.message);
      await submitLead({
        source: 'website:contact',
        name: form.name,
        email: form.email,
        phone: form.phone,
        poolSize: form.size,
        notes: noteParts.join(' · '),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="pad-card" style={{
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 24,
      position: 'relative',
    }}>
      {submitted && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.97)', borderRadius: 24,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 40, textAlign: 'center',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 999, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24"><path d="M5 12l5 5 9-9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', fontWeight: 400 }}>Message sent.</h3>
          <p style={{ marginTop: 14, color: 'var(--ink-3)', maxWidth: '36ch' }}>
            Thanks for reaching out — our team will get back to you shortly.
          </p>
          <button type="button" onClick={() => setSubmitted(false)} className="btn" style={{ marginTop: 24 }}>
            Send another
          </button>
        </div>
      )}

      <div className="h-eyebrow" style={{ marginBottom: 20 }} {...headingBind}>{heading}</div>

      <div className="r-grid-form">
        <CInput label="Name" value={form.name} onChange={v => update('name', v)} placeholder="Your name" />
        <CInput label="Phone number" value={form.phone} onChange={v => update('phone', v)} placeholder="050 000 0000" />
        <CInput label="Email" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" full />
      </div>

      <div style={{ marginTop: 20 }}>
        <CLabel>Service type</CLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8,
          padding: 4, background: 'var(--track)', border: '1px solid var(--line)', borderRadius: 12,
        }}>
          {SERVICE_TYPES.map(o => {
            const on = o === form.serviceType;
            return (
              <button type="button" key={o} onClick={() => update('serviceType', o)} style={{
                all: 'unset', cursor: 'default', textAlign: 'center',
                padding: '10px 6px', borderRadius: 9, fontSize: 13,
                background: on ? '#fff' : 'transparent',
                fontWeight: on ? 500 : 400,
                color: on ? 'var(--ink)' : 'var(--ink-3)',
                boxShadow: on ? '0 1px 2px rgba(26,61,42,0.10)' : 'none',
              }}>{o}</button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <CLabel>Pool type</CLabel>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {POOL_TYPES.map(o => {
            const on = o === form.poolType;
            return (
              <button type="button" key={o} onClick={() => update('poolType', o)} style={{
                all: 'unset', cursor: 'default',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', borderRadius: 10, fontSize: 14,
                border: '1px solid ' + (on ? 'var(--ink)' : 'var(--line)'),
                background: on ? '#fff' : 'transparent',
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                  border: '1px solid ' + (on ? 'var(--accent)' : 'var(--mute)'),
                  background: on ? 'var(--accent)' : 'transparent',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {on && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
                </span>
                {o}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <CInput label="Size of pool (approx)" value={form.size} onChange={v => update('size', v)} placeholder="e.g. 60 m³ or 12 × 6 m" full />
      </div>

      <div style={{ marginTop: 20 }}>
        <CLabel>Message</CLabel>
        <textarea
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
          rows={4}
          placeholder="Tell us about your pool and what you need…"
          style={{
            width: '100%', marginTop: 8,
            background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
            padding: '14px 16px', color: 'var(--ink)', fontSize: 14.5, lineHeight: 1.5,
            fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      </div>

      <label style={{
        marginTop: 20, display: 'flex', alignItems: 'flex-start', gap: 10,
        fontSize: 13, color: 'var(--ink-3)', cursor: 'default',
      }}>
        <input
          type="checkbox"
          checked={form.agree}
          onChange={(e) => update('agree', e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--accent)' }}
        />
        <span>
          I agree to the <a href="/privacy-policy" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>Privacy Policy</a> and consent to PoolCare contacting me about my request.
        </span>
      </label>

      <button type="submit" disabled={submitting} className="btn btn-accent" style={{
        marginTop: 24, width: '100%', justifyContent: 'center', height: 60, fontSize: 16,
        opacity: submitting ? 0.7 : (form.agree ? 1 : 0.55),
      }}>
        {submitting ? 'Sending…' : 'Send message'}
        {!submitting && <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>
      {error && (
        <p style={{ marginTop: 14, fontSize: 13, color: '#a23d2a', textAlign: 'center' }}>{error}</p>
      )}
    </form>
  );
}

function CLabel({ children }) {
  return <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '0.01em', color: 'var(--ink-2)' }}>{children}</div>;
}

function CInput({ label, value, onChange, placeholder, full }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      gridColumn: full ? '1 / -1' : 'auto',
    }}>
      <CLabel>{label}</CLabel>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          all: 'unset',
          background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
          padding: '13px 16px', color: 'var(--ink)', fontSize: 14.5,
        }}
      />
    </label>
  );
}


export { ContactPage };
