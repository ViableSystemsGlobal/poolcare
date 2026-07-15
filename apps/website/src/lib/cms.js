'use client';
import { useEffect, useState } from 'react';
import { useCmsInitial } from './cms-context';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// Origin of the admin Website Studio that embeds this site in an edit iframe.
// Messages are only accepted from / sent to these origins (comma-separated env,
// defaults to the local admin dev server). Set NEXT_PUBLIC_STUDIO_ORIGIN in prod
// to e.g. https://admin.poolcare.africa.
const STUDIO_ORIGINS = (process.env.NEXT_PUBLIC_STUDIO_ORIGIN || 'http://localhost:3002')
  .split(',').map((s) => s.trim()).filter(Boolean);
const STUDIO_TARGET = STUDIO_ORIGINS[0] || '*';

/**
 * Supplies CMS content for a key with two modes:
 *  - Live: fetches the PUBLISHED content from the API, falling back to the
 *    bundled `fallback` if the API is unreachable (the marketing site must
 *    never break).
 *  - Edit (inside the admin Studio iframe, ?cms=edit): renders DRAFT content
 *    pushed in over postMessage and reports clicks back so the Studio can
 *    open the matching field. The preview becomes a pure function of whatever
 *    the Studio sends.
 */
export function useCmsContent(key, fallback) {
  // Server-preloaded published content (via CmsProvider) takes priority over the
  // bundled fallback, so SSR renders the live copy. Falls back when not provided.
  const serverContent = useCmsInitial(key);
  const [content, setContent] = useState(serverContent ?? fallback);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isEdit = params.get('cms') === 'edit' && window.parent !== window;
    setEditMode(isEdit);

    if (isEdit) {
      const onMsg = (e) => {
        // Only trust messages from the Studio's origin.
        if (!STUDIO_ORIGINS.includes(e.origin)) return;
        const m = e.data;
        if (!m || m.key !== key) return;
        if (m.type === 'cms:content') setContent(m.content || fallback);
        if (m.type === 'cms:highlight') {
          document.querySelectorAll('.cms-selected').forEach((el) => el.classList.remove('cms-selected'));
          if (m.field) {
            const el = document.querySelector(`[data-cms-field="${cssEscape(m.field)}"]`);
            if (el) el.classList.add('cms-selected');
          }
        }
      };
      window.addEventListener('message', onMsg);

      // In edit mode, never let the preview navigate away.
      const blockNav = (e) => {
        const a = e.target.closest && e.target.closest('a');
        if (a) e.preventDefault();
      };
      document.addEventListener('click', blockNav, true);

      window.parent.postMessage({ type: 'cms:ready', key }, STUDIO_TARGET);
      return () => {
        window.removeEventListener('message', onMsg);
        document.removeEventListener('click', blockNav, true);
      };
    }

    // Live mode — if the server already preloaded this key, use it (no refetch).
    if (serverContent != null) return;
    // Otherwise fetch published content, keeping the fallback on any failure.
    let alive = true;
    fetch(`${API_BASE}/public/website/${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive && data && data.content) setContent(data.content); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { content, editMode };
}

/** Props that make an element editable in the Studio (marks it + reports clicks). */
export function cmsBind(editMode, key, path) {
  if (!editMode) return {};
  return {
    'data-cms-field': path,
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'cms:select', key, field: path }, STUDIO_TARGET);
    },
  };
}

function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}
