'use client';
import React from 'react';
import { PhotoUpload } from './PhotoUpload';
import { submitLead } from '../lib/submit-lead';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Homepage quote request.
// Visitors give their pool details + contact info and we email them a tailored
// quote. This is the homepage's primary conversion point (the full on-site
// assessment lives on its own /assessment page).
//
// Pool size + chemical coverage are captured so the team can prepare an
// accurate quote — no fabricated precise prices are shown on the page.

const SIZES = [
  { id: 's', label: 'Up to 60 m³', sub: 'Small–mid pools' },
  { id: 'm', label: '60–120 m³',   sub: 'Mid–large pools' },
  { id: 'l', label: 'Over 120 m³', sub: 'Villas & estates' },
];

const COVERAGE = [
  { id: 'self', label: 'I supply chemicals', sub: 'Service-only' },
  { id: 'full', label: 'Include chemicals',  sub: 'Fully managed' },
];

function Quote() {
  const [form, setForm] = React.useState({
    name: '', email: '', phone: '',
    size: 's', coverage: 'full', notes: '',
  });
  const { content, editMode } = useCmsContent('page.home', {});
  const q = content?.quote || {};
  const bind = (p) => cmsBind(editMode, 'page.home', `quote.${p}`);
  const [photos, setPhotos] = React.useState([]); // File[] of pool images
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  const update = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const sizeLabel = SIZES.find(s => s.id === form.size)?.label || form.size;
      const chemicals = form.coverage === 'self' ? 'Client-supplied' : 'Included';
      await submitLead(
        {
          source: 'website:quote',
          name: form.name,
          email: form.email,
          phone: form.phone,
          poolSize: sizeLabel,
          chemicals,
          notes: form.notes,
        },
        photos
      );
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="section" id="quote">
      <div className="wrap">
        <div className="r-grid-2-r" style={{ alignItems: 'stretch' }}>
          {/* Left: copy + pool details */}
          <div>
            <span className="h-eyebrow" {...bind('eyebrow')}>{q.eyebrow || 'Get a quote'}</span>
            <h2 className="display-2" style={{ margin: '16px 0 0' }}>
              <span {...bind('title')}>{q.title || 'A tailored quote,'}</span><br/>
              <span className="serif-italic muted" {...bind('titleAccent')}>{q.titleAccent || 'straight to your inbox.'}</span>
            </h2>
            <p className="h-lead" style={{ margin: '20px 0 40px', maxWidth: '46ch' }} {...bind('lead')}>
              {q.lead || "Tell us about your pool and how you'd like it managed. We'll email you a tailored quote — final pricing is confirmed after a free on-site assessment."}
            </p>

            <Field label="Pool size">
              <Segmented
                options={SIZES.map(s => ({ value: s.id, label: s.label, sub: s.sub }))}
                value={form.size}
                onChange={v => update('size', v)}
              />
            </Field>

            <Field label="Chemicals">
              <Segmented
                options={COVERAGE.map(c => ({ value: c.id, label: c.label, sub: c.sub }))}
                value={form.coverage}
                onChange={v => update('coverage', v)}
              />
            </Field>

            <div style={{
              marginTop: 8, padding: '16px 18px',
              border: '1px solid var(--line)', borderRadius: 14,
              background: 'var(--paper)',
              fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5,
            }} {...bind('note')}>
              {q.note || 'Every pool is assessed before a plan is assigned — we evaluate size, usage and system condition to confirm the right level of care.'}
            </div>
          </div>

          {/* Right: contact form card */}
          <form onSubmit={submit} className="stick-off" style={{
            position: 'sticky', top: 100, alignSelf: 'start',
            background: 'var(--ink)',
            color: '#fff',
            borderRadius: 24,
            padding: 40,
            overflow: 'hidden',
          }}>
            {/* water-caustic decoration */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 90% 10%, rgba(243,208,66,0.16), transparent 40%), radial-gradient(circle at 0% 100%, rgba(122,214,255,0.16), transparent 40%)',
              pointerEvents: 'none',
            }} />

            {submitted && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(10,31,58,0.96)', borderRadius: 24,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 40, textAlign: 'center', zIndex: 2,
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 999, background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24"><path d="M5 12l5 5 9-9" stroke="#1a3d2a" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '-0.02em', fontWeight: 400 }}>Quote on its way.</h3>
                <p style={{ marginTop: 16, color: 'rgba(255,255,255,0.7)', maxWidth: '34ch' }}>
                  Thanks &mdash; we&rsquo;ve got your details and will email your
                  tailored quote shortly, usually the same business day.
                </p>
                <button type="button" onClick={() => setSubmitted(false)} className="btn btn-light" style={{ marginTop: 28 }}>
                  Request another
                </button>
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <div className="h-eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }} {...bind('formHeading')}>{q.formHeading || 'Your details'}</div>

              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Input label="Your name" value={form.name} onChange={v => update('name', v)} placeholder="Faustina Bossman" required />
                <Input label="Email" type="email" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" required />
                <Input label="Phone" value={form.phone} onChange={v => update('phone', v)} placeholder="050 622 6222" />

                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.65)' }}>
                    Anything else? (optional)
                  </span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => update('notes', e.target.value)}
                    rows={3}
                    placeholder="Equipment age, current issues, prior service…"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 12,
                      padding: '14px 16px',
                      color: '#fff', fontSize: 14.5, lineHeight: 1.5,
                      fontFamily: 'inherit', resize: 'vertical',
                    }}
                  />
                </label>

                <PhotoUpload onChange={setPhotos} />
              </div>

              <button type="submit" disabled={submitting} className="btn btn-accent" style={{ width: '100%', marginTop: 28, justifyContent: 'center', height: 60, fontSize: 16, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Sending…' : (q.submitLabel || 'Email me a quote')}
                {!submitting && <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
              {error && (
                <p style={{ marginTop: 14, fontSize: 13, color: '#ffb4a8', textAlign: 'center' }}>{error}</p>
              )}
              <p style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }} {...bind('footnote')}>
                {q.footnote || 'We typically respond the same business day. No spam, no marketing list.'}
              </p>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', letterSpacing: '-0.01em' }}>{label}</span>
        {hint && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${options.length}, 1fr)`,
      gap: 6, padding: 4,
      background: 'var(--track)',
      borderRadius: 14,
      border: '1px solid var(--line)',
    }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              all: 'unset', cursor: 'default',
              padding: '12px 10px', borderRadius: 10,
              textAlign: 'center',
              background: on ? '#fff' : 'transparent',
              boxShadow: on ? '0 1px 2px rgba(10,31,58,0.10), 0 4px 12px rgba(10,31,58,0.04)' : 'none',
              transition: 'background .15s ease',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em', color: on ? 'var(--ink)' : 'var(--ink-2)' }}>{o.label}</div>
            {o.sub && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text', required }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.65)' }}>{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          all: 'unset',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 12,
          padding: '14px 16px',
          color: '#fff', fontSize: 14.5,
        }}
      />
    </label>
  );
}


export { Quote };
