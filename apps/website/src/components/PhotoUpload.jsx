'use client';
import React from 'react';

// PoolCare — reusable pool-photo picker for the lead forms.
// Multi-select + drag/drop, live thumbnail previews, remove. Styled for the
// dark form cards. Lifts the selected File[] up via onChange; the actual
// upload happens when the form is wired to the CRM intake (multipart/form-data).

let _uid = 0;

function PhotoUpload({ onChange, max = 6 }) {
  const [items, setItems] = React.useState([]); // [{ id, file, url }]
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef(null);

  // Revoke any outstanding object URLs on unmount (avoid memory leaks).
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  React.useEffect(() => () => {
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url));
  }, []);

  const emit = (next) => {
    setItems(next);
    if (onChange) onChange(next.map((it) => it.file));
  };

  const add = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!incoming.length) return;
    const room = Math.max(0, max - items.length);
    const added = incoming.slice(0, room).map((file) => ({
      id: 'p' + (++_uid),
      file,
      url: URL.createObjectURL(file),
    }));
    if (added.length) emit([...items, ...added]);
  };

  const remove = (id) => {
    const target = items.find((it) => it.id === id);
    if (target) URL.revokeObjectURL(target.url);
    emit(items.filter((it) => it.id !== id));
  };

  const full = items.length >= max;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.65)' }}>
        Photos of your pool (optional)
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { add(e.target.files); e.target.value = ''; }}
      />

      {!full && (
        <button
          type="button"
          onClick={() => inputRef.current && inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          style={{
            all: 'unset', cursor: 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '18px 16px',
            border: '1px dashed ' + (drag ? 'var(--accent)' : 'rgba(255,255,255,0.24)'),
            borderRadius: 12,
            background: drag ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
            color: 'rgba(255,255,255,0.8)', fontSize: 14,
            transition: 'border-color .15s ease, background .15s ease',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Add photos
        </button>
      )}

      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{
              position: 'relative', aspectRatio: '1 / 1',
              borderRadius: 10, overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.14)',
            }}>
              <img src={it.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button
                type="button"
                onClick={() => remove(it.id)}
                aria-label="Remove photo"
                style={{
                  all: 'unset', cursor: 'default',
                  position: 'absolute', top: 4, right: 4,
                  width: 22, height: 22, borderRadius: 999,
                  background: 'rgba(10,31,58,0.8)', color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>
        Up to {max} images · helps us prepare an accurate quote.
      </span>
    </div>
  );
}


export { PhotoUpload };
