"use client";

import { useEffect, useRef } from "react";

/*
 * Google Maps as a plain base layer. It takes no input of its own: the parent
 * owns the view (drag, zoom, fit) and passes center + integer zoom, which we
 * mirror with moveCamera. Google and our markers share the 256px Web Mercator
 * grid, so they line up exactly.
 *
 * onFail fires on a bad/blocked key, a disabled Maps JavaScript API, a script
 * that won't load, or tiles that never arrive — the parent then falls back.
 */

export type GoogleMapType = "roadmap" | "hybrid";

declare global {
  interface Window {
    google?: any;
    gm_authFailure?: () => void;
    __poolcareGmapsInit?: () => void;
  }
}

let loader: Promise<void> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    // Google calls this global when the key is rejected or the API isn't enabled.
    window.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((fn) => fn());
    };
    window.__poolcareGmapsInit = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&callback=__poolcareGmapsInit&loading=async`;
    s.async = true;
    s.onerror = () => {
      loader = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

// Quieter road map: no shop/business pins or transit, so our markers read first.
const ROAD_STYLE = [
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export function GoogleBase({
  apiKey,
  center,
  zoom,
  mapType,
  onReady,
  onFail,
}: {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom: number;
  mapType: GoogleMapType;
  onReady: () => void;
  onFail: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const cb = useRef({ onReady, onFail });
  cb.current = { onReady, onFail };
  const cam = useRef({ center, zoom });
  cam.current = { center, zoom };

  // Create once.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      if (!cancelled) cb.current.onFail();
    };
    if (authFailed) {
      fail();
      return;
    }
    authListeners.add(fail);
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !el.current || authFailed) return;
        const g = window.google.maps;
        map.current = new g.Map(el.current, {
          center: cam.current.center,
          zoom: cam.current.zoom,
          mapTypeId: mapType,
          styles: ROAD_STYLE,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
          isFractionalZoomEnabled: false,
          backgroundColor: "#e8e8e6",
        });
        // No tiles within 12s = something's wrong (e.g. API not enabled): fall back.
        timer = setTimeout(fail, 12000);
        g.event.addListenerOnce(map.current, "tilesloaded", () => {
          if (timer) clearTimeout(timer);
          if (!cancelled && !authFailed) cb.current.onReady();
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      authListeners.delete(fail);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Follow the parent's view.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (typeof m.moveCamera === "function") m.moveCamera({ center, zoom });
    else {
      m.setZoom(zoom);
      m.setCenter(center);
    }
  }, [center.lat, center.lng, zoom]);

  useEffect(() => {
    map.current?.setMapTypeId(mapType);
  }, [mapType]);

  // Pointer events pass through to the parent, which handles drag and zoom.
  return <div ref={el} className="absolute inset-0 pointer-events-none" aria-hidden />;
}
