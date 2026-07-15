"use client";
import React from "react";
import { Nav } from "@/components/Nav";
import { PageHero } from "@/components/PageHero";
import { Footer } from "@/components/Footer";
import { useCmsContent } from "@/lib/cms";

const FALLBACK = {
  eyebrow: "Company — Careers",
  title: "We're hiring",
  body: "PoolCare is growing its team of technicians and support staff in Accra. Join the people who keep the city's pools clear, balanced and monitored.",
};

const TYPE_LABEL: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
};

export default function CareersClient({ roles }: { roles: any[] }) {
  const { content } = useCmsContent("page.careers", {});
  const c: any = content || FALLBACK;

  return (
    <>
      <Nav home="/" />
      <main>
        <PageHero
          eyebrow={c.eyebrow || FALLBACK.eyebrow}
          title={c.title || FALLBACK.title}
          subtitle={c.body || FALLBACK.body}
          image="https://images.unsplash.com/photo-1572331165267-854da2b10ccc?w=2400&q=80&auto=format&fit=crop"
        />

        <section className="section">
          <div className="wrap" style={{ maxWidth: 860 }}>
            {roles.length === 0 ? (
              <div style={{ padding: "40px 0", textAlign: "center" }}>
                <p className="h-lead" style={{ margin: 0 }}>
                  No open roles right now — but we're always glad to hear from good people.
                </p>
                <p style={{ color: "var(--ink-3)", marginTop: 12 }}>
                  Send your CV to <a href="mailto:info@poolcare.africa">info@poolcare.africa</a> and we'll keep it on file.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="h-eyebrow" style={{ marginBottom: 4 }}>
                  Open roles · {roles.length}
                </div>
                {roles.map((r) => (
                  <a
                    key={r.slug}
                    href={`/careers/${r.slug}`}
                    className="card"
                    style={{ padding: 24, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}
                  >
                    <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 20 }}>{r.title}</h3>
                      <p style={{ margin: "6px 0 0", color: "var(--ink-3)", fontSize: 14.5 }}>
                        {[r.department, r.location, TYPE_LABEL[r.employmentType] || r.employmentType]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {r.summary && (
                        <p style={{ margin: "10px 0 0", color: "var(--ink-2)", fontSize: 15 }}>{r.summary}</p>
                      )}
                    </div>
                    <span className="btn btn-outline" style={{ flexShrink: 0 }}>
                      View role
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer home="/" />
    </>
  );
}
