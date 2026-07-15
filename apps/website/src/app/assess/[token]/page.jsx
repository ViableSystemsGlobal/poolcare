'use client';

// Public, no-login on-site assessment form. The assigned team member opens this
// from the emailed link (poolcare.africa/assess/<token>) and fills the report.
// It posts to the token-gated public API — no auth, no admin. Standalone page on
// the public marketing site, styled with the site's design tokens.
import React from 'react';
import { useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const NUMERIC = ['volumeL', 'ph', 'chlorineFree', 'alkalinity', 'calciumHardness', 'cyanuricAcid', 'salinity', 'conditionRating'];

const inputStyle = {
  width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--line)',
  padding: '0 14px', fontSize: 15, color: 'var(--ink)', background: '#fff', outline: 'none',
};
const areaStyle = { ...inputStyle, height: 'auto', padding: '12px 14px', lineHeight: 1.5, resize: 'vertical' };
const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--ink-3)', marginBottom: 6 };

export default function AssessmentForm() {
  const { token } = useParams();
  const [state, setState] = React.useState('loading'); // loading | error | ready | done
  const [error, setError] = React.useState('');
  const [meta, setMeta] = React.useState(null);
  const [form, setForm] = React.useState({});
  const [photos, setPhotos] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    fetch(`${API_BASE}/public/assessment/${token}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'This link is invalid or has expired.'); return r.json(); })
      .then((d) => {
        setMeta(d);
        const f = d.fields || {};
        setForm({
          poolType: f.poolType || '', surfaceType: f.surfaceType || '', filtrationType: f.filtrationType || '',
          volumeL: f.volumeL ?? '', dimensions: f.dimensions || '',
          ph: f.ph ?? '', chlorineFree: f.chlorineFree ?? '', alkalinity: f.alkalinity ?? '',
          calciumHardness: f.calciumHardness ?? '', cyanuricAcid: f.cyanuricAcid ?? '', salinity: f.salinity ?? '',
          conditionRating: f.conditionRating ?? '', equipmentNotes: f.equipmentNotes || '', findings: f.findings || '',
          recommendation: f.recommendation || '', recommendedPlan: f.recommendedPlan || '',
          estimatedCost: f.estimatedCostCents != null ? String(f.estimatedCostCents / 100) : '',
        });
        setPhotos(f.photoUrls || []);
        setState(d.status === 'COMPLETED' ? 'done' : 'ready');
      })
      .catch((e) => { setError(e.message); setState('error'); });
  }, [token]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const upload = async (files) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('image', file);
        const res = await fetch(`${API_BASE}/public/assessment/${token}/photo`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Upload failed');
        const { url } = await res.json();
        setPhotos((p) => [...p, url]);
      }
    } catch { alert('Photo upload failed — please try again.'); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        poolType: form.poolType || undefined, surfaceType: form.surfaceType || undefined, filtrationType: form.filtrationType || undefined,
        dimensions: form.dimensions || undefined, equipmentNotes: form.equipmentNotes || undefined,
        findings: form.findings || undefined, recommendation: form.recommendation || undefined, recommendedPlan: form.recommendedPlan || undefined,
        photoUrls: photos,
      };
      for (const k of NUMERIC) if (form[k] !== '' && form[k] != null) payload[k] = Number(form[k]);
      if (form.estimatedCost !== '' && form.estimatedCost != null) payload.estimatedCostCents = Math.round(Number(form.estimatedCost) * 100);
      const res = await fetch(`${API_BASE}/public/assessment/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Submit failed');
      setState('done');
      window.scrollTo({ top: 0 });
    } catch (e) { alert(e.message || 'Could not submit'); }
    finally { setSubmitting(false); }
  };

  if (state === 'loading') return <Shell><p style={{ color: 'var(--ink-3)' }}>Loading…</p></Shell>;
  if (state === 'error') return (
    <Shell><div style={{ textAlign: 'center', maxWidth: 360 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--ink)', margin: 0 }}>Link unavailable</h1>
      <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>{error}</p>
    </div></Shell>
  );
  if (state === 'done') return (
    <Shell><div style={{ textAlign: 'center', maxWidth: 400 }}>
      <div style={{ width: 64, height: 64, borderRadius: 999, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--ink)', margin: 0 }}>Assessment submitted</h1>
      <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>Thank you. The PoolCare office has received the report for {meta?.account}. You can close this page.</p>
    </div></Shell>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--track)', padding: '40px 16px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <img src="/images/logo.png" alt="PoolCare" style={{ height: 26, width: 'auto' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>On-site assessment</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 }}>{meta?.account}</h1>
        <p style={{ color: 'var(--ink-3)', margin: '6px 0 28px', fontSize: 15 }}>
          {meta?.scheduledAt ? `Scheduled ${new Date(meta.scheduledAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Fill in the details below.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Pool details">
            <Grid>
              <Text label="Pool type" v={form.poolType} on={(x) => set('poolType', x)} ph="skimmer, infinity…" />
              <Text label="Filtration" v={form.filtrationType} on={(x) => set('filtrationType', x)} ph="chlorine, saltwater…" />
              <Text label="Surface" v={form.surfaceType} on={(x) => set('surfaceType', x)} />
              <Num label="Volume (L)" v={form.volumeL} on={(x) => set('volumeL', x)} />
              <Text label="Dimensions" v={form.dimensions} on={(x) => set('dimensions', x)} ph="8m × 4m × 1.5m" wide />
            </Grid>
          </Card>

          <Card title="Water chemistry">
            <Grid cols={3}>
              <Num label="pH" v={form.ph} on={(x) => set('ph', x)} step="0.1" />
              <Num label="Free Cl (ppm)" v={form.chlorineFree} on={(x) => set('chlorineFree', x)} step="0.1" />
              <Num label="Alkalinity" v={form.alkalinity} on={(x) => set('alkalinity', x)} />
              <Num label="Calcium" v={form.calciumHardness} on={(x) => set('calciumHardness', x)} />
              <Num label="Cyanuric" v={form.cyanuricAcid} on={(x) => set('cyanuricAcid', x)} />
              <Num label="Salinity" v={form.salinity} on={(x) => set('salinity', x)} step="0.1" />
            </Grid>
          </Card>

          <Card title="Findings & recommendation">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Num label="Overall condition (1–5)" v={form.conditionRating} on={(x) => set('conditionRating', x)} min="1" max="5" />
              <Area label="Findings" v={form.findings} on={(x) => set('findings', x)} ph="Observed condition, issues found…" />
              <Area label="Equipment notes" v={form.equipmentNotes} on={(x) => set('equipmentNotes', x)} ph="Pump, filter, heater condition…" />
              <Area label="Recommendation" v={form.recommendation} on={(x) => set('recommendation', x)} />
              <Text label="Recommended plan" v={form.recommendedPlan} on={(x) => set('recommendedPlan', x)} ph="e.g. Weekly full-service" />
              <Num label="Estimated cost (GH₵)" v={form.estimatedCost} on={(x) => set('estimatedCost', x)} step="0.01" />
            </div>
          </Card>

          <Card title="Photos">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {photos.map((url, i) => (
                <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                    style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 999, border: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>×</button>
                </div>
              ))}
              <label style={{ aspectRatio: '1', borderRadius: 10, border: '2px dashed var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer' }}>
                {uploading ? 'Uploading…' : '+ Add'}
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={uploading} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
          </Card>

          <button onClick={submit} disabled={submitting}
            style={{ height: 52, borderRadius: 14, border: 0, background: 'var(--ink)', color: '#fff', fontSize: 16, fontWeight: 500, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit assessment'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', paddingBottom: 32 }}>Saved to the PoolCare office. You can close this page after submitting.</p>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return <div style={{ minHeight: '100vh', background: 'var(--track)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>{children}</div>;
}
function Card({ title, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--line)', padding: 18 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 14px' }}>{title}</p>
      {children}
    </div>
  );
}
function Grid({ children, cols = 2 }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>;
}
function Text({ label, v, on, ph, wide }) {
  return <div style={wide ? { gridColumn: '1 / -1' } : undefined}><label style={labelStyle}>{label}</label><input style={inputStyle} value={v} onChange={(e) => on(e.target.value)} placeholder={ph} /></div>;
}
function Num({ label, v, on, step, min, max }) {
  return <div><label style={labelStyle}>{label}</label><input type="number" step={step} min={min} max={max} style={inputStyle} value={v} onChange={(e) => on(e.target.value)} /></div>;
}
function Area({ label, v, on, ph }) {
  return <div><label style={labelStyle}>{label}</label><textarea rows={2} style={areaStyle} value={v} onChange={(e) => on(e.target.value)} placeholder={ph} /></div>;
}
