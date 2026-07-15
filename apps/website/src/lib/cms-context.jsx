'use client';
import { createContext, useContext, useMemo } from 'react';

// Holds server-fetched published CMS content as a { key: content } map so client
// components can render the live published copy during SSR (good for SEO/AIEO)
// instead of their bundled fallback. Providers merge, so a global provider can
// supply `site` while a page-level one adds page docs.
const CmsContext = createContext({});

export function CmsProvider({ initial, children }) {
  const parent = useContext(CmsContext);
  const value = useMemo(() => ({ ...parent, ...(initial || {}) }), [parent, initial]);
  return <CmsContext.Provider value={value}>{children}</CmsContext.Provider>;
}

/** The server-preloaded content for a key, or undefined if none was provided. */
export function useCmsInitial(key) {
  return useContext(CmsContext)[key];
}
