"use client";
import React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const MAX_CV_BYTES = 5 * 1024 * 1024;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  border: "1px solid var(--line)",
  borderRadius: 10,
  fontSize: 15,
  fontFamily: "inherit",
  background: "var(--surface, #fff)",
  color: "inherit",
};

export default function ApplyForm({ slug, roleTitle }: { slug: string; roleTitle: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [cvName, setCvName] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const cv = fd.get("cv") as File | null;
    if (cv && cv.size > MAX_CV_BYTES) {
      setError("CV must be 5 MB or smaller.");
      return;
    }
    if (cv && cv.size === 0) fd.delete("cv"); // no file chosen
    setState("sending");
    try {
      const res = await fetch(`${API_BASE}/public/careers/${slug}/apply`, { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(d.message) ? d.message[0] : d.message || "Something went wrong. Please try again.");
      }
      setState("done");
    } catch (err: any) {
      setError(err.message);
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="card" style={{ padding: 28, textAlign: "center" }}>
        <h3 style={{ margin: 0 }}>Application received ✓</h3>
        <p style={{ color: "var(--ink-3)", margin: "10px 0 0" }}>
          Thanks for applying for {roleTitle}. We review every application and will be in touch if there's a fit.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <input name="name" required placeholder="Full name *" style={inputStyle} aria-label="Full name" />
        <input name="email" type="email" required placeholder="Email *" style={inputStyle} aria-label="Email" />
      </div>
      <input name="phone" placeholder="Phone (optional)" style={inputStyle} aria-label="Phone" />
      {/* Honeypot — hidden from real users; bots that fill it are silently dropped */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      <textarea
        name="coverNote"
        rows={4}
        placeholder="Tell us briefly why you're a good fit (optional)"
        style={{ ...inputStyle, resize: "vertical" }}
        aria-label="Cover note"
      />
      <label
        style={{
          ...inputStyle,
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          color: cvName ? "inherit" : "var(--ink-3)",
        }}
      >
        <input
          type="file"
          name="cv"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: "none" }}
          onChange={(e) => setCvName(e.target.files?.[0]?.name || null)}
        />
        <span aria-hidden>📎</span>
        {cvName || "Attach your CV — PDF or Word, max 5 MB (optional)"}
      </label>
      {error && <p style={{ color: "#b42318", margin: 0, fontSize: 14.5 }}>{error}</p>}
      <div>
        <button className="btn btn-lg" type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}
