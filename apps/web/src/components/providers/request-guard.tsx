"use client";

/*
 * Double-submit guard for the whole admin.
 *
 * Wraps window.fetch once. If an identical write (same method + URL + body)
 * is already in flight — or finished less than DOUBLE_CLICK_MS ago — the
 * second call doesn't hit the server again; it gets a copy of the first
 * response. So a double-clicked "Create", "Send" or "Save" makes ONE record,
 * whichever page or helper sent it, while both callers still see success.
 *
 * Reads (GET/HEAD/OPTIONS) are never touched, and different bodies are
 * different requests, so deliberate repeat actions with new data still go.
 */

const DOUBLE_CLICK_MS = 800;

type Entry = { promise: Promise<Response>; doneAt: number | null };

const inflight = new Map<string, Entry>();

function bodyKey(body: BodyInit | null | undefined): string | null {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const parts: string[] = [];
    body.forEach((v, k) => {
      parts.push(
        typeof v === "string" ? `${k}=${v}` : `${k}=file:${(v as File).name}:${v.size}:${(v as File).lastModified ?? ""}`
      );
    });
    return parts.join("&");
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) return `blob:${body.size}:${body.type}`;
  return null; // streams etc.: can't fingerprint safely, don't dedupe
}

function install() {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.__poolcareRequestGuard) return;
  w.__poolcareRequestGuard = true;

  const original = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return original(input, init);
    // A Request object carrying its own body can't be fingerprinted without consuming it.
    if (input instanceof Request && !init?.body) return original(input, init);

    const body = bodyKey(init?.body);
    if (body === null) return original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const key = `${method} ${url}\n${body}`;

    const now = Date.now();
    const existing = inflight.get(key);
    if (existing && (existing.doneAt === null || now - existing.doneAt < DOUBLE_CLICK_MS)) {
      return existing.promise.then((r) => r.clone());
    }

    // Keep the original response unread; every caller (including the first) gets a clone.
    const entry: Entry = { promise: original(input, init), doneAt: null };
    inflight.set(key, entry);
    const settle = () => {
      entry.doneAt = Date.now();
      setTimeout(() => {
        if (inflight.get(key) === entry) inflight.delete(key);
      }, DOUBLE_CLICK_MS);
    };
    entry.promise.then(settle, settle);
    return entry.promise.then((r) => r.clone());
  };
}

install();

export function RequestGuard() {
  return null;
}
