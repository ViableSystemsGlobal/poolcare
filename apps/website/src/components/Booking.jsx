'use client';
import React from 'react';
import { submitLead } from '../lib/submit-lead';
import { useCmsContent, cmsBind } from '../lib/cms';

// PoolCare — Booking / Get a quote form

function Booking() {
  const { content, editMode } = useCmsContent('page.assessment', {});
  const bk = content?.booking || {};
  const bind = (p) => cmsBind(editMode, 'page.assessment', `booking.${p}`);
  const [form, setForm] = React.useState({
    name: '', email: '', phone: '', address: '',
    poolType: 'Private villa', poolAge: '',
    services: { flex: false, premium: true, plus: false, luxury: false },
    notes: '',
  });
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  const update = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const toggleSvc = (k) => setForm(s => ({ ...s, services: { ...s.services, [k]: !s.services[k] }}));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const plans = Object.entries(form.services).filter(([, v]) => v).map(([k]) => k).join(', ');
      const noteParts = [];
      if (form.poolType) noteParts.push(`Property type: ${form.poolType}`);
      if (form.poolAge) noteParts.push(`Pool age: ${form.poolAge}`);
      if (plans) noteParts.push(`Plans considered: ${plans}`);
      if (form.notes) noteParts.push(form.notes);
      await submitLead({
        source: 'website:assessment',
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.address,
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
    <section className="section" id="booking" style={{ background: 'var(--ink)', color: '#fff' }}>
      <div className="wrap">
        <div className="r-grid-2-r" style={{
          alignItems: 'flex-start',
        }}>
          <div className="stick-cover" style={{ position: 'sticky', top: 100, '--cover-bg': 'var(--ink)' }}>
            <span className="h-eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }} {...bind('eyebrow')}>{bk.eyebrow || 'Book a pool assessment'}</span>
            <h2 className="display-2" style={{ margin: '16px 0 24px', color: '#fff' }}>
              <span {...bind('title')}>{bk.title || 'Let our team'}</span><br/>
              <span className="serif-italic" style={{ color: 'rgba(255,255,255,0.55)' }} {...bind('titleAccent')}>{bk.titleAccent || 'evaluate your system.'}</span>
            </h2>
            <p className="h-lead" style={{ maxWidth: '36ch', color: 'rgba(255,255,255,0.72)' }}>
              Book a pool assessment and let our team evaluate your system,
              water condition, and service requirements. We&rsquo;ll recommend
              the right plan for your property.
            </p>

            <div style={{
              marginTop: 36, display: 'flex', flexDirection: 'column', gap: 18,
            }}>
              {[
                ['Free on-site assessment',  'No obligation, no upsell'],
                ['Plan recommendation',      'Right level of management'],
                ['Start within a week',      'Most new pools in 5\u20137 days'],
              ].map(([t, d]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 999,
                    background: 'var(--accent)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7l2.5 2.5L11 4" stroke="#1a3d2a" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{t}</div>
                    <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="pad-card" style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 24,
            position: 'relative',
          }}>
            {submitted && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(10,31,58,0.96)', borderRadius: 24,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 40, textAlign: 'center',
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 999, background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24"><path d="M5 12l5 5 9-9" stroke="#1a3d2a" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: '-0.02em', fontWeight: 400 }}>Assessment booked.</h3>
                <p style={{ marginTop: 16, color: 'rgba(255,255,255,0.7)', maxWidth: '36ch' }}>
                  We&rsquo;ll be in touch shortly to schedule your free pool
                  assessment and recommend the right plan for your property.
                </p>
                <button onClick={() => setSubmitted(false)} className="btn btn-light" style={{ marginTop: 28 }}>
                  Submit another
                </button>
              </div>
            )}

            <div className="h-eyebrow" style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 20 }}>01 · Contact</div>
            <div className="r-grid-form">
              <Input label="Your name" value={form.name} onChange={v => update('name', v)} placeholder="Faustina Bossman" />
              <Input label="Phone" value={form.phone} onChange={v => update('phone', v)} placeholder="050 622 6222" />
              <Input label="Email" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" full />
              <Input label="Pool address" value={form.address} onChange={v => update('address', v)} placeholder="Plot 12, East Legon, Accra" full />
            </div>

            <hr style={{ border: 0, height: 1, background: 'rgba(255,255,255,0.10)', margin: '32px 0 24px' }} />

            <div className="h-eyebrow" style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 20 }}>02 &middot; Your pool</div>
            <div className="r-grid-form">
              <PickGroup
                label="Property type"
                value={form.poolType}
                options={['Private villa', 'Gated community', 'Guest house', 'Hospitality']}
                onChange={v => update('poolType', v)}
              />
              <Input label="Pool age (approx)" value={form.poolAge} onChange={v => update('poolAge', v)} placeholder="e.g. 8 years" />
            </div>

            <div style={{ marginTop: 20 }}>
              <FieldLabel>Plan you&rsquo;re considering</FieldLabel>
              <div className="r-grid-svcs-pick" style={{ marginTop: 8 }}>
                {[
                  ['flex',     'Flex (service-only)'],
                  ['premium',  'Premium (water management)'],
                  ['plus',     'Premium Plus (equipment care)'],
                  ['luxury',   'Luxury Villa (concierge)'],
                ].map(([k, lbl]) => {
                  const on = form.services[k];
                  return (
                    <button type="button" key={k} onClick={() => toggleSvc(k)} style={{
                      all: 'unset', cursor: 'default',
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px',
                      border: '1px solid ' + (on ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.14)'),
                      background: on ? 'rgba(255,255,255,0.08)' : 'transparent',
                      borderRadius: 12,
                      fontSize: 14,
                    }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: '1px solid ' + (on ? 'var(--accent)' : 'rgba(255,255,255,0.4)'),
                        background: on ? 'var(--accent)' : 'transparent',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {on && <svg width="9" height="9" viewBox="0 0 9 9"><path d="M2 4.5l1.5 1.5 3.5-3.5" stroke="#1a3d2a" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <FieldLabel>Anything else? (optional)</FieldLabel>
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                rows={3}
                placeholder="Equipment age, current issues, prior service\u2026"
                style={{
                  width: '100%', marginTop: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  color: '#fff', fontSize: 14.5, lineHeight: 1.5,
                  fontFamily: 'inherit', resize: 'vertical',
                }}
              />
            </div>

            <button type="submit" disabled={submitting} className="btn btn-accent" style={{
              marginTop: 28, width: '100%', justifyContent: 'center', height: 64, fontSize: 16, opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? 'Sending…' : 'Book my pool assessment'}
              {!submitting && <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
            {error && (
              <p style={{ marginTop: 14, fontSize: 13, color: '#ffb4a8', textAlign: 'center' }}>{error}</p>
            )}
            <p style={{
              marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'center',
            }}>
              We typically respond the same business day. No spam, no marketing list.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.65)' }}>{children}</div>;
}

function Input({ label, value, onChange, placeholder, full }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      gridColumn: full ? '1 / -1' : 'auto',
    }}>
      <FieldLabel>{label}</FieldLabel>
      <input
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

function PickGroup({ label, value, options, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <div className="r-grid-pick">
        {options.map(o => {
          const on = o === value;
          return (
            <button key={o} type="button" onClick={() => onChange(o)} style={{
              all: 'unset', cursor: 'default',
              padding: '10px 8px', textAlign: 'center',
              borderRadius: 8, fontSize: 13.5,
              background: on ? '#fff' : 'transparent',
              color: on ? 'var(--ink)' : '#fff',
              fontWeight: on ? 500 : 400,
            }}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}


export { Booking };
