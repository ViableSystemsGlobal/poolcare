# PoolCare Management System — Manager Console Spec (v1)

**Goal:** A web console to schedule/dispatch carers, manage clients/pools, generate & collect payments for invoices, review quality, and run AI-powered ops (dispatching, dosing guidance, report writing, QC, inbox triage).

---

## 1) Tech Stack & Architecture

* **Web App:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
* **State/Data:** React Query; Zod for schemas; TanStack Table for grids
* **Backend:** Supabase (Postgres + Auth + Storage + Realtime) + Edge Functions (Deno) or Node microservice for heavy tasks
* **Search:** Postgres full-text (tsvector) + trigram
* **Payments:** Paystack (webhooks + inline)
* **Messaging:** WhatsApp Business Cloud API (Meta), SMS (Deywuro), Email (SMTP)
* **Maps/Routes:** Google Maps Platform (Matrix + Directions). Phase 2: OR-Tools service
* **Observability:** Sentry (frontend + backend), Postgres logs, Logtail/Datadog
* **Infra:** Vercel (web) or Hostinger + Docker; Supabase Cloud

### Monorepo (recommended)

```
/apps
  /manager-web (Next.js)
  /ai-service (Node/Express or Deno edge)
/packages
  /ui (shared components)
  /db (Zod types, SQL, query helpers)
  /utils (auth, feature flags)
```

---

## 2) Domain Model (ERD overview)

**Entities:** users, carers, clients, pools, service_plans, jobs, visit_entries, readings, chemicals_used, photos, issues, quotes, invoices, payments, inventory_* (phase 2), messages/threads.

---

## 3) Database — SQL (Supabase/Postgres)

> Run in order. Apply RLS after seeding an admin.

```sql
-- 3.1 Core reference
create type job_status as enum ('scheduled','en_route','on_site','completed','failed','cancelled');
create type issue_severity as enum ('low','medium','high','critical');
create type location_type as enum ('warehouse','truck');

-- 3.2 Tenancy & users
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table public.org_members (
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('ADMIN','MANAGER','CARER','CLIENT')) not null,
  primary key (org_id, user_id)
);

-- Convenience mapping for carers & clients
create table public.carers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  phone text,
  home_base_geo geography(Point,4326),
  active boolean default true,
  created_at timestamptz default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  billing_address text,
  preferred_channel text check (preferred_channel in ('WHATSAPP','SMS','EMAIL')) default 'WHATSAPP',
  created_at timestamptz default now()
);

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text,
  address text,
  geolocation geography(Point,4326),
  volume_l int,
  surface_type text,
  equipment jsonb,
  notes text,
  created_at timestamptz default now()
);

-- Plans & jobs
create table public.visit_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  checklist jsonb not null,
  targets jsonb,
  service_duration_min int default 45,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.service_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  pool_id uuid not null references public.pools(id) on delete cascade,
  frequency text check (frequency in ('weekly','biweekly','monthly')) not null,
  visit_template_id uuid references public.visit_templates(id),
  price_cents int not null,
  currency text default 'GHS',
  next_visit_at timestamptz,
  window_start time,
  window_end time,
  created_at timestamptz default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  pool_id uuid not null references public.pools(id) on delete cascade,
  plan_id uuid references public.service_plans(id) on delete set null,
  scheduled_start timestamptz,
  window_start timestamptz,
  window_end timestamptz,
  status job_status default 'scheduled',
  assigned_carer_id uuid references public.carers(id) on delete set null,
  eta_minutes int,
  distance_meters int,
  sequence int,
  sla_minutes int default 120,
  notes text,
  created_at timestamptz default now()
);

create index on public.jobs (assigned_carer_id, scheduled_start);
create index on public.jobs (status, scheduled_start);
create index on public.pools using gist(geolocation);

-- Visit performance
create table public.visit_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  started_at timestamptz,
  completed_at timestamptz,
  client_signature_url text,
  rating int check (rating between 1 and 5),
  feedback text,
  created_at timestamptz default now()
);

create table public.readings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  visit_id uuid not null references public.visit_entries(id) on delete cascade,
  ph numeric,
  chlorine_free numeric,
  chlorine_total numeric,
  alkalinity int,
  calcium_hardness int,
  cyanuric_acid int,
  temp_c numeric,
  measured_at timestamptz default now()
);

create table public.chemicals_used (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  visit_id uuid not null references public.visit_entries(id) on delete cascade,
  chemical text,
  qty numeric,
  unit text,
  lot_no text,
  cost_cents int
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  visit_id uuid not null references public.visit_entries(id) on delete cascade,
  url text not null,
  label text check (label in ('before','after','issue')),
  taken_at timestamptz default now()
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  visit_id uuid not null references public.visit_entries(id) on delete cascade,
  type text,
  severity issue_severity default 'low',
  description text,
  requires_quote boolean default false,
  status text check (status in ('open','quoted','scheduled','resolved')) default 'open'
);

-- Quotes, invoices, payments
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  issue_id uuid references public.issues(id) on delete set null,
  pool_id uuid not null references public.pools(id) on delete cascade,
  items jsonb not null,
  total_cents int not null,
  currency text default 'GHS',
  status text check (status in ('pending','approved','rejected')) default 'pending',
  created_at timestamptz default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  total_cents int not null,
  currency text default 'GHS',
  status text check (status in ('draft','sent','paid','overdue','void')) default 'draft',
  paystack_ref text,
  issued_at timestamptz default now(),
  due_at timestamptz
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_cents int not null,
  method text,
  provider_ref text,
  paid_at timestamptz default now()
);

-- Messaging (threads)
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  pool_id uuid references public.pools(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  carer_id uuid references public.carers(id) on delete set null,
  created_at timestamptz default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_user_id uuid references auth.users(id),
  body text,
  media_url text,
  created_at timestamptz default now()
);
```

### 3.1 Row Level Security (RLS) — Highlights

> Ensure you have a `current_org()` helper (via `jwt` claim or session var) and a `is_role(role)` SQL helper.

```sql
alter table organizations enable row level security;
alter table org_members enable row level security;
-- ... enable for all tables above

-- Example policy pattern for org scoping
create policy org_isolation on public.pools
  for select using (org_id = current_setting('request.jwt.claims', true)::jsonb->>'org_id');

-- Carer visibility for jobs
create policy carer_jobs on public.jobs
  for select using (
    org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid
    and (
      is_role('ADMIN') or is_role('MANAGER') or assigned_carer_id in (
        select c.id from carers c where c.user_id = auth.uid()
      )
    )
  );

-- Client visibility (jobs belonging to their pools)
create policy client_jobs on public.jobs
  for select using (
    exists(
      select 1 from pools p
      join clients cl on cl.id = p.client_id
      where p.id = jobs.pool_id and cl.user_id = auth.uid()
    )
  );
```

> Repeat org_isolation + role checks for other tables. Use **signed URLs** (short TTL) for Storage.

---

## 4) External Integrations

### 4.1 Paystack

* **Webhook**: `/webhooks/paystack` → verify signature → upsert payment → set invoice.status = 'paid' → emit realtime event.
* **Inline Checkout**: client app & manager console quick-collect.

**Example webhook handler contract**

```json
{
  "event": "charge.success",
  "data": {
    "reference": "PSK_abc123",
    "amount": 180000,
    "currency": "GHS",
    "metadata": {"invoice_id": "...", "org_id": "..."}
  }
}
```

### 4.2 WhatsApp / SMS / Email

* **Outbound**: reminders (T-24h, T-1h), visit complete report, invoice link.
* **Inbound**: capture replies to **threads/messages**; AI Inbox triage to intents (billing, schedule, water quality).
* **Delivery**: Store provider message_id → status updates via webhooks.

---

## 5) AI Services

### 5.1 AI Dispatcher

* **Input**: org_id, date, jobs (coords, windows, durations), carers (skills, home base), distance matrix.
* **Output**: per-carer arrays sorted with `sequence`, ETA, distance; reassignment suggestions.
* **Run**: on schedule publish; every 15m if risks.

### 5.2 AI Dosing Coach (carer app inline)

* Library with rules → AI refines text + rationale; strict caps to avoid unsafe advice.

### 5.3 AI Report Writer

* **Input**: checklist deltas, readings before/after, issue notes, photos.
* **Output**: Markdown/HTML saved to Storage; client-safe tone.

### 5.4 AI Quality Auditor

* **Signals**: EXIF vs timestamps, missing mandatory steps/photos, anomalies (z-score per metric), duration sanity.
* **Output**: audit_score (0–100), flags with reasons.

### 5.5 AI Inbox Triage & Smart Replies

* NLU intents + templates with variables (links to invoice, reschedule, thank-you, maintenance tips).

> **Guardrails**: All AI actions create preview diffs. Manager must **Apply** for changes that affect routes or client communication (except canned reminders).

---

## 6) Manager UI — Pages & Components

### 6.1 Auth & Org

* `/login`, `/signup`, `/switch-org`
* Invite flow: add member → email OTP → set role

### 6.2 Dashboard

* KPI cards: Today jobs (scheduled, on-time %), Late risk, Revenue (MTD), Overdue invoices, Inventory low (phase 2)
* **Map**: carers live positions, job pins with status
* **AI Panel**: Suggestions feed (route changes, risk clients, low stock)

### 6.3 Scheduling

* **Calendar/Board** view (day/week)
* Create **Service Plan** (frequency, window, template, price)
* Generate jobs 8 weeks rolling
* **Optimize** button → AI Dispatcher → preview diff → Apply

### 6.4 Jobs

* Table: client, pool, window, status, assigned, SLA, last update
* Bulk actions: assign, reschedule, cancel
* Job drawer: details, history, timeline

### 6.5 Clients & Pools

* Clients table → Client profile → Pools list
* Pool page: equipment, last readings, issues, photos, attachments

### 6.6 Quotes & Invoices

* Create quote from issue → send for approval
* Invoice list, aging, quick-collect, export CSV

### 6.7 Quality

* Visit audits table with **audit_score**; filters; evidence viewer

### 6.8 Inbox

* Omni-inbox (WhatsApp/SMS/Email). Left threads, middle messages, right client/pool context. Smart reply suggestions.

### 6.9 Settings

* Org profile, templates, dosing rules, roles & permissions, webhooks, API keys

---

## 7) Permissions Matrix (MVP)

| Resource                           | ADMIN | MANAGER | CARER                    | CLIENT  |
| ---------------------------------- | ----- | ------- | ------------------------ | ------- |
| Organizations                      | CRUD  | R       | -                        | -       |
| Members                            | CRUD  | R       | -                        | -       |
| Clients/Pools                      | CRUD  | CRUD    | R (assigned jobs' pools) | R (own) |
| Service Plans                      | CRUD  | CRUD    | -                        | -       |
| Jobs                               | CRUD  | CRUD    | R/W (own)                | R (own) |
| Visits (entries, readings, photos) | CRUD  | CRUD    | C/R (own)                | R (own) |
| Issues/Quotes                      | CRUD  | CRUD    | C (own job)              | R (own) |
| Invoices/Payments                  | CRUD  | CRUD    | -                        | R (own) |
| Inbox                              | CRUD  | CRUD    | -                        | -       |

---

## 8) Background Jobs & Events

* **Schedulers**: generate rolling jobs; reminder notifications
* **Monitors**: ETA drift → SLA risk → AI suggestion
* **Webhooks**: Paystack, WhatsApp/SMS
* **Workers**: photo optimization, report generation (AI), audit scoring

Event bus (table `events`): `job.created`, `job.assigned`, `job.started`, `job.completed`, `invoice.paid`, etc.

---

## 9) Notifications (default cadence)

* **Client**: T-24h reminder; T-1h ETA; Visit complete report; Invoice
* **Carer**: Morning route; change alerts
* **Manager**: SLA risk alerts; payment received; audit failures

---

## 10) Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE=
PAYSTACK_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
DEYWURO_API_KEY=
SMTP_HOST= / SMTP_USER= / SMTP_PASS=
MAPS_API_KEY=
AI_MODEL=
```

---

## 11) API Contracts (selected)

### 11.1 Route & Jobs

* `GET /api/jobs?date=2025-10-30&status=scheduled,en_route`
* `POST /api/dispatch/optimize` → `{ date }` → returns changes
* `POST /api/jobs/:id/assign` → `{ carer_id }`
* `POST /api/jobs/:id/reschedule` → `{ window_start, window_end }`

### 11.2 Quotes & Invoices

* `POST /api/quotes` → `{ pool_id, items[] }`
* `POST /api/invoices` → `{ client_id, job_id?, quote_id?, total_cents }`
* `POST /api/invoices/:id/pay/paystack` → initializes transaction
* `POST /webhooks/paystack`

### 11.3 Inbox

* `POST /webhooks/whatsapp` / `POST /webhooks/sms`
* `POST /api/inbox/suggest-reply` → `{ thread_id }`

---

## 12) UI Components (shadcn/ui)

* **SchedulerBoard** (calendar + drag-drop)
* **RoutePreviewDiff** (list of reorders/assignments)
* **JobTable** (TanStack Table with column filters)
* **AuditScoreBadge**, **SLAChip**, **StatusPill**
* **ClientDrawer**, **PoolDrawer**
* **QuoteBuilder**, **InvoicePanel**
* **OmniInbox** (3-pane)

---

## 13) Seeding & Fixtures

* Org + Admin user
* 5 carers with base locations
* 20 clients + 20 pools (Accra test coords)
* 3 templates (Weekly Basic, Deep Clean, Inspection)
* 8-week jobs generated

---

## 14) Security & Compliance

* RLS on every table; service role only in server routes
* Short-lived signed URLs for photos/reports
* Audit logs (who changed what, when) via triggers → `audit_log` table
* PII minimization; export/delete on request

---

## 15) Analytics & KPIs

* SLA hit %, average visit duration, on-time arrival %, first-time fix %, chemical cost/visit
* Revenue: MRR by plan, ARPU, DSO
* Quality: audit_score distribution, repeat issues by pool
* Ops: route km/visit, utilization %, cancellations

---

## 16) Delivery Plan (sprint-wise)

**Sprint 1 (7–10 days)**

* Auth + Org + Members
* Clients/Pools CRUD
* Templates + Service Plans
* Job generation + Job table

**Sprint 2**

* Scheduling Board + Assign/Reschedule
* Paystack invoices (draft→sent→paid) + webhook
* Notifications (email/SMS) basic

**Sprint 3**

* AI Dispatcher (preview diff) + Dashboard map
* Inbox (WhatsApp ingest) + Smart Replies (basic)
* Quality Auditor (rules-based + score)

**Sprint 4**

* Reports (AI writer) + Storage + client links
* Analytics dashboard + exports
* Hardening, tests, and docs

---

## 17) Test Plan (outline)

* API: Zod-validated handlers; supertest E2E
* RLS: policy tests using anon vs service role
* Payments: webhook signature + idempotency
* Schedulers: deterministic generation; time window edge cases
* AI: snapshot tests for prompts; guardrail cases

---

## 18) Example Payloads

**Dispatch Optimize (request)**

```json
{ "date": "2025-10-30", "org_id": "..." }
```

**Dispatch Optimize (response)**

```json
{
  "changes": [
    {"carer_id":"c1","job_id":"j3","from":2,"to":1,"eta_change_min":-12},
    {"carer_id":"c2","job_id":"j7","reassign_to":"c1"}
  ],
  "summary": {"late_risk_reduced": 4, "km_saved": 12.3}
}
```

**Invoice (create)**

```json
{ "client_id": "...", "job_id": "...", "total_cents": 18000, "currency": "GHS" }
```

---

## 19) Next Up

* Generate Supabase **RLS policies** in full for all tables.
* Scaffold Next.js pages + shadcn components.
* Implement `/webhooks/paystack` and `/api/dispatch/optimize` (stub with heuristic + matrix API).
* Wire up AI panels (dispatcher, inbox, reports) with preview/apply flow.


Module 1 — Auth & Organizations (Management System)
1) Objectives

Securely authenticate users (OTP-first), create/join organizations, and issue JWTs that carry org + role.

Enforce multi-tenancy in Postgres via RLS using per-request session variables.

Provide the Manager Console a clean way to invite members and manage roles.

2) Scope (what’s in / what’s not)

In

OTP login (SMS or email), optional admin password login

Users, Organizations, OrgMemberships (roles: ADMIN, MANAGER, CARER, CLIENT)

“First-login org” bootstrap (new user gets a default org unless invited)

Invite members by phone/email; set roles; update roles/disable

JWT issue/refresh; per-request Postgres session var setting (user_id, org_id, role)

Basic rate-limits & anti-abuse on OTP requests

Out (deferred)

SSO (Google/Microsoft)

Device management / token revocation lists

Organization billing/plans

3) Success Criteria (“definition of done”)

A new user can request OTP → verify → receives JWT with {sub, org_id, role}.

An admin can invite a member (phone/email) and assign a role; the member logs in and lands in the same org.

All queries to protected tables (Org, OrgMember and any table we add next) respect RLS using Postgres session vars.

Rate limits: OTP request cooldown enforced; max attempts per code enforced.

Security review passes (no org-leak queries without org scope).

4) Interfaces (API contracts)

POST /auth/otp/request → { channel: 'phone'|'email', target } → { ok: true }

POST /auth/otp/verify → { channel, target, code } → { token, user:{...}, org:{ id }, role }

GET /orgs/me → { id, name } (scoped by JWT)

POST /orgs/members → { target, role, name? } → { invitedUserId, role } (ADMIN/MANAGER only)

PATCH /orgs/members/:userId → { role? } → updated membership (ADMIN/MANAGER only)

Tokens: Bearer JWT in Authorization header.
Claims: sub (user id), org_id (active org), role.

5) Data Model (Module 1 entities only)

User: id, phone?, email?, name?, passwordHash?, createdAt

Organization: id, name, createdAt

OrgMember: orgId, userId, role, createdAt

OtpRequest: id, channel, target, codeHash, purpose='login', attempts, expiresAt, cooldownAt, usedAt, userId?

Indexes:

OrgMember(userId) (list orgs per user fast)

OtpRequest(target, purpose) (latest OTP fetch)

6) Security Model

JWT: Signed with server secret; short-to-medium expiry. Optional refresh token (Phase 2).

RLS: Postgres ENABLE ROW LEVEL SECURITY + policies using session vars:

app.user_id, app.org_id, app.role set per request.

Read Organization only if user is a member.

CRUD OrgMember restricted to ADMIN/MANAGER of that org.

Session Var Injection: Each HTTP request is wrapped in a DB transaction where we SET LOCAL the three vars before any query runs.

OTP: store hash only, not raw code; enforce cooldown & attempt caps.

7) Abuse & Reliability Controls

OTP request cooldown (e.g., 45s) per target.

Max attempts per code (e.g., 5).

Optional IP/user-agent logging for abuse detection.

Idempotent invites (upsert membership).

Consistent org selection: if user has multiple orgs, UI prompts to choose, or pass X-Org-Id (Phase 2).

8) UX Contracts (how the Manager Console will use it)

Login Flow: Enter phone/email → receive OTP → verify → stored JWT → fetch /orgs/me → redirect to dashboard.

Invite Flow: Admin → “Invite Member” modal → submit → toast success; invited user logs in via OTP and lands in org.

Role Update: Row action in Members table → set to MANAGER/CARER/CLIENT → immediate effect on next request.

9) Dependencies & Config

DB: PostgreSQL 15+ on your Hostinger VPS (we’ll run migrations).

Queues: Not required for Module 1 (OTP sending can run inline; later we can queue).

Providers: SMS (Deywuro) or Email (SMTP). For dev, console log fallback.

Env: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, OTP_CODE_TTL_SECONDS, OTP_REQUEST_COOLDOWN_SECONDS, OTP_MAX_ATTEMPTS, DEYWURO_API_KEY or SMTP_*

10) Cross-Module Boundaries

All future tables (Clients, Pools, Jobs, etc.) will include orgId and adopt the same RLS pattern.

The token’s org_id (or a UI “switch org” action) is the authoritative scope for all subsequent modules.

11) Risks & Mitigations

Risk: Forgetting to set session vars → RLS denies or leaks.
Mitigation: Global interceptor wraps every handler; unit tests assert vars present.

Risk: OTP deliverability.
Mitigation: Dual channel (SMS/email), resend after cooldown, debug path in dev.

Risk: Users with multiple orgs.
Mitigation: In Module 1, pick first org; Module 2 adds Org Switcher endpoint/UI.

12) Observability & Ops

Logs: Structured JSON (request id, route, user_id, org_id).

Metrics (basic): OTP requests, OTP verifications, invite actions, policy denials.

Alerts: Spike in OTP failures; RLS “permission denied” anomalies.

Backups: Nightly pg_dump from day one.

13) Test Plan

Unit: OTP generator/hash; JWT signing/validation.

Integration:

Request/verify OTP happy path & failure modes (expired, wrong code, too many attempts).

Invite → login as invited user → membership exists with correct role.

RLS:

With app.org_id unset → deny.

User in Org A cannot read/modify Org B members.

Security: JWT tamper test; missing/invalid token → 401.

14) Deliverables (tangible outputs)

Schemas & migrations for User, Organization, OrgMember, OtpRequest.

RLS SQL for Organization & OrgMember (policy templates we’ll reuse).

Auth API: /auth/otp/request, /auth/otp/verify.

Org API: /orgs/me, /orgs/members (invite), /orgs/members/:userId (role update).

Global request wrapper that sets Postgres session vars.

Docs: Postman/Insomnia collection (or .http file) + env sample.

15) Acceptance Demo (how we’ll prove it works)

Request OTP → verify → receives JWT; /orgs/me returns an org.

Using Admin JWT: invite jane@example.com as MANAGER → success.

Jane verifies OTP → her /orgs/me = inviter’s org; her role=MANAGER.

Attempt to update a member with a CLIENT token → 403.

RLS test: query OrgMember with wrong org session var → no rows.




Module 2 — Users, Carers & Clients (Management System)
1) Objectives

Model and manage the people in the system: staff who perform work (Carers) and paying Clients (and their account contacts).

Expose clean CRUD APIs with org-scoped RLS and validation.

Enable the Carer app to fetch its profile/preferences and the Manager Console to manage rosters and customer lists.

2) Scope (what’s in / what’s not)

In

Entities & CRUD: User (readonly via Auth), Carer, Client

Carer fields: contact, status (active), base location, skills, availability, vehicle, preferences (nav app, language)

Client fields: billing contact(s), comms channel, tags, notes

Device tokens (push notifications) registration

Basic search/filter + pagination

Out (deferred)

Multi-contact Clients (beyond primary) → Phase 2

Territories/teams & shift planning (later with Scheduling)

KYC/Docs upload (later)

3) Success Criteria

Manager can create/edit/deactivate Carers and Clients within their org.

Carer app can fetch/update own profile (prefs, availability) and register device token.

All reads/writes are org-scoped via RLS; cross-org access blocked.

Search by name/phone/email returns correct results within org.

4) Interfaces (API contracts)
Carers

GET /carers?query&active=true|false&page&limit

POST /carers → { userId?, name, phone, active?, homeBase:{lat,lng}?, skills?:string[], vehicle?:{type,plate}? }

GET /carers/:id

PATCH /carers/:id → partial update

POST /carers/:id/device-tokens → { token, platform: 'ios'|'android' }

Self: GET /me/carer, PATCH /me/carer (prefs: language, navApp, availability)

Clients

GET /clients?query&page&limit&tag

POST /clients → { name, email?, phone?, billingAddress?, preferredChannel?, tags?:string[] }

GET /clients/:id

PATCH /clients/:id → partial update

(Read-only later) GET /clients/:id/pools (Module 3 will populate)

Auth: Bearer JWT (from Module 1).
Roles: ADMIN/MANAGER full CRUD; CARER read own Carer record; CLIENT read own Client record.

5) Data Model (additive to Module 1)

Carer

id (uuid), orgId (uuid), userId (uuid), name, phone,
active (bool), homeBaseLat (float), homeBaseLng (float),
skills (text[]), vehicle (json: {type,plate}),
language (text), navApp (text: 'google'|'apple'|'waze'),
availability (json: weekly windows), createdAt, updatedAt.

Client

id (uuid), orgId, userId?, name, email?, phone?,
billingAddress?, preferredChannel ('WHATSAPP'|'SMS'|'EMAIL'),
tags (text[]), notes text, createdAt, updatedAt.

DeviceToken

id (uuid), orgId, userId, carerId?, clientId?, token (text), platform ('ios'|'android'|'web'), createdAt.

Indexes

Carer(orgId, active), Carer(orgId, name), Client(orgId, name), Client(orgId, phone), DeviceToken(userId)

6) Security Model (RLS)

Carer

SELECT: user is ADMIN/MANAGER in org or is the linked user for that Carer (self).

INSERT/UPDATE/DELETE: ADMIN/MANAGER in org only.

Client

SELECT: ADMIN/MANAGER in org or the client’s own linked user (self).

INSERT/UPDATE/DELETE: ADMIN/MANAGER in org only.

DeviceToken

INSERT: user may register their own token (userId = JWT.sub, orgId = JWT.org_id).

SELECT/DELETE: ADMIN/MANAGER within org; user can delete own tokens.

RLS implemented with ENABLE RLS + policies using app.user_id, app.org_id, app.role (set by Module 1 interceptor).

7) Validation & Business Rules

Phone/email normalized lowercased; E.164 for phone where possible.

Creating a Carer:

If userId supplied, must be a member of org (or we also add membership as CARER).

If no userId, auto-create a User with phone/email (optional) and add membership.

Deactivating a Carer sets active=false; future job assignment logic will exclude inactive.

Client: at least one of phone/email must be present; preferredChannel must match an available contact.

Tags: small controlled list (e.g., VIP, Late Payer, Commercial) configurable later.

8) UX Contracts

Manager Console

Carers List: filters (active, skill), bulk deactivate, create/edit drawer.

Clients List: filters (tag), quick actions (Message, Create Plan once Pools exist).

Carer App

Profile screen: language, nav app, availability toggles; submit to PATCH /me/carer.

On first login, if carer profile missing → guided profile setup.

Client App

Read-only profile page; can update preferred channel (Phase 2).

9) Dependencies & Config

Postgres migrations (Prisma) extending schema.

No external providers required beyond Module 1.

Optional: Geocoding to set homeBaseLat/Lng from address (Phase 2).

10) Cross-Module Boundaries

Jobs (Module 6): assignedCarerId references Carer.id; active=false carers excluded from assignment.

Pools/Plans (Module 3/5): Client.id used for ownership and billing.

Notifications: DeviceToken used by Module 12 to push reminders/status.

11) Risks & Mitigations

Dangling memberships if deleting users: use soft constraints and cascade membership deletes cautiously; prefer deactivate instead of delete.

Privacy leaks through search: RLS + server-side orgId filters; limit fields in responses (no PII beyond what’s necessary).

Token sprawl: dedupe device tokens per user; prune on 410/404 push responses.

12) Observability & Ops

Log: CRUD actions with org_id, actor_user_id, entity id.

Metrics: # active Carers, # Clients, device tokens count, profile completion rate.

Alerts: spikes in 4xx on create/update (could indicate RLS mistakes).

13) Test Plan

Unit: DTO validation; normalizers; permissions helpers.

Integration:

ADMIN creates Carer with/without existing userId.

MANAGER updates Carer preferences.

CARER reads only own Carer record; cannot list all.

CLIENT reads only own Client record.

RLS:

Cross-org read/write denied.

Device tokens: user cannot attach token to another user.

Search: case-insensitive match; pagination stable ordering.

14) Deliverables

Prisma models + migrations for Carer, Client, DeviceToken.

RLS SQL policies for the three tables.

NestJS CarersController/Service and ClientsController/Service with guards (ADMIN/MANAGER vs self).

Device token endpoint for push notifications.

Seed script: a few demo Carers/Clients in your Accra org.

15) Acceptance Demo

As ADMIN, create two Carers (one via userId, one via phone).

As MANAGER, edit a Carer’s active status and skills; search list by name.

As CARER (self), fetch /me/carer, update navApp='google', register device token.

As ADMIN, create a Client; update preferred channel; search by phone.

Verify RLS: a CARER cannot list other Carers; a CLIENT cannot access other Clients.






Module 3 — Pools (Assets)
1) Objectives

Create a clean source of truth for each pool asset: location, volume, surface type, equipment, warranties, targets, photos.

Power scheduling (plans/jobs), dosing hints, client reports, and map/route features.

Enforce org-scoped access and safe client/carer visibility.

2) Scope (in / out)

In

CRUD for Pool

Equipment registry (lightweight) + warranty fields

Geolocation (lat/lng) with optional geocoding from address

Pool-level target ranges (override template defaults)

Attachments/photos (link to Files module)

Tags/notes for search and segmentation

Out (deferred)

Multi-asset estates & shared plant rooms (Phase 2)

Detailed BOM/parts inventory linkage (Phase 2)

IoT telemetry linkage (Phase 3)

3) Success Criteria

Manager can create/edit pools; see on map; search by client, address, tag.

Client can view their own pools.

Carer can view pool detail only for jobs they’re assigned to.

Service Plans (Module 5) can reference pools; Jobs (Module 6) resolve location & targets from pool.

4) Interfaces (API contracts)

Pools (Manager/Admin)

GET /pools?clientId&query=&tag=&page=&limit=
Returns list with client, address, coords, volume, tags, lastVisitAt.

POST /pools
{
  "clientId":"...", "name":"Main Pool",
  "address":"Adjiringanor Gate 3, Accra",
  "lat":5.63, "lng":-0.17,
  "volumeL":45000, "surfaceType":"tile",
  "equipment":{"pump":{"brand":"Astral","model":"X300"}, "filter":{"type":"sand","size_mm":700}, "heater":null},
  "warranty":{"pump":"2027-06-01","filter":"2026-09-01"},
  "targets":{"ph":[7.2,7.6], "chlorine_free":[1,3], "alkalinity":[80,120]},
  "tags":["VIP"], "notes":"Access via side gate"
}
GET /pools/:id

PATCH /pools/:id (partial)

DELETE /pools/:id (soft delete recommended)

Pools (Client)

GET /clients/me/pools

GET /clients/me/pools/:id

Pools (Carer)

GET /carers/me/pools?date=YYYY-MM-DD → returns only pools tied to assigned jobs in that window

GET /carers/me/jobs/:jobId/pool → exact pool for the job

Attachments (uses Files module)

POST /pools/:id/attachments/presign → presigned POST; then POST /pools/:id/attachments/commit with key & meta

5) Data Model

Pool

id uuid, orgId uuid, clientId uuid

name text, address text, lat float, lng float

volumeL int, surfaceType text (enum later),
equipment jsonb (pump/filter/heater/chlorinator with brand/model/serial),
warranty jsonb (component → ISO date)

targets jsonb (optional pool-specific ranges)

tags text[], notes text

createdAt, updatedAt, deletedAt?

PoolAttachment

id uuid, orgId, poolId, url text, label text (photo, warranty_doc, drawing), takenAt timestamptz?, meta jsonb

Indexes

Pool(orgId, clientId), Pool(orgId, name), GIST on (lat, lng) if using PostGIS

PoolAttachment(poolId)

6) Security (RLS)

Pool

SELECT:

ADMIN/MANAGER in org: all pools in org

CLIENT: pools where pool.clientId belongs to the client mapped to this user

CARER: pools only for jobs assigned to the carer (via subquery on Jobs in date range or any future job; for carer app we’ll expose job-scoped read)

INSERT/UPDATE/DELETE: ADMIN/MANAGER in org

PoolAttachment

SELECT: same as Pool visibility for its poolId

INSERT/DELETE: ADMIN/MANAGER in org

Implement with app.user_id, app.org_id, app.role session vars (from Module 1). Use views if you want a simplified carer-scoped read.

7) Validation & Business Rules

Address optional if lat/lng supplied; if only address, backend may geocode (Phase 2).

volumeL > 0; cap max to prevent silly input (e.g., 5M L).

targets keys limited to known metrics; each a 2-element array [min, max] with min < max.

equipment structured but tolerant (jsonb), enforce known keys and safe length.

Soft delete to preserve history; prevent deletion if active Service Plans exist (require detach).

8) UX Contracts

Manager Console

Pools table: columns (Client, Name, Address, Volume, Tags, Last Visit, Next Visit)

Map view toggle (pins colored by next visit SLA risk)

Drawer with sections: Overview • Equipment • Targets • Attachments • Notes

Quick actions: “Create Service Plan”, “View Jobs”, “Message Client”

Client App

Pool screen: equipment, warranties, last readings, last visit photos; download warranty PDF

Carer App

Job Detail → Pool snapshot block: volume, surface type, equipment icons, last readings; link to attachments

9) Dependencies & Config

Reuses Users/Clients from Module 2.

Files module for attachments (presigned uploads).

Optional: Google Maps API for map preview; Geocoding (Phase 2).

10) Cross-Module Boundaries

Service Plans (Module 5): ServicePlan.poolId references Pool; window/price per pool.

Jobs (Module 6): Job.poolId references Pool; route mapping uses lat/lng.

Visits (Module 7): Reports show pool snapshots; targets drive color-coding of readings.

Issues/Quotes (Module 8): Issues attach to visits but display under Pool.

Invoices (Module 9): Billing rolls up by Client; pool context shown on line items.

11) Risks & Mitigations

Bad geodata → route optimization breaks.
Mitigation: require either valid lat/lng or geocode on create; flag missing coords in UI.

Unbounded equipment JSON grows.
Mitigation: server limits keys/size; prune unknown keys.

Deleting pools with dependencies.
Mitigation: soft delete; block delete if plans/jobs exist; offer “archive.”

12) Observability & Ops

Logs: pool create/update/delete with org & actor

Metrics: pools per org, % with coords, % with targets set, attachment count

Alerts: error spikes on create/edit; map load failures

13) Test Plan

Unit: DTO validation for targets & equipment; tag normalization.

Integration:

ADMIN creates Pool with lat/lng; edits equipment and targets.

MANAGER uploads attachment; retrieve via list.

CLIENT (self) can read only their pools.

CARER can read pool for their assigned job; cannot list all pools.

RLS:

Cross-org reads blocked.

Inserts/updates denied for non-manager roles.

Search: query by client name/address/tag with pagination deterministic order.

14) Deliverables

Prisma models + migrations for Pool, PoolAttachment.

RLS SQL policies for both tables.

NestJS PoolsController/Service with Manager, Client, and Carer routes (scoped).

Map endpoints (optional helper): GET /pools/nearby?lat&lng&radiusKm for planning tools.

Seed: create demo pools for a few clients around Accra (coords).

15) Acceptance Demo

As ADMIN, create a pool (with coords & targets), attach a warranty PDF, and tag it VIP.

As MANAGER, list pools, search by address fragment, open map view, and start a service plan (stub).

As CLIENT, fetch /clients/me/pools and view your pool details & attachments.

As CARER assigned to a job for that pool, fetch /carers/me/jobs/:jobId/pool and see the snapshot.

Try cross-org reads/writes → denied by RLS.





Module 4 — Visit Templates (Checklists, Targets, Duration)
1) Objectives

Standardize field work into reusable templates: checklist steps, required photos, water-chemistry target ranges, and expected duration.

Power consistent carer workflows, AI dosing/context, and quality auditing.

Enable versioning so historical visits keep their original rules.

2) Scope (in / out)

In

CRUD for VisitTemplate

Versioning (immutable template_version rows; latest is default)

Checklist schema (steps, requirement flags, photo requirements)

Chemistry targets (e.g., pH, FC, TA, CH, CYA, Temp)

Default serviceDurationMin

Template assignment on Service Plans

Org-scoped sharing + copy/duplicate

Out (deferred)

Per-client overrides inside template (handled by Pool targets instead)

Conditional logic in checklists (Phase 2)

Multi-language translations (Phase 2)

3) Success Criteria

Manager can create, duplicate, and publish a template (v1, v2, …).

Service Plans can reference specific version or “latest”.

Carer app renders checklist & required photo prompts from the template.

Historical visits remain tied to the version used at the time.

4) Interfaces (API contracts)

Templates (Manager/Admin)

GET /visit-templates?query=&page=&limit= → list (latest only, with version & usage count)

POST /visit-templates





Module 5 — Service Plans (Recurring Maintenance)
1) Objectives

Define recurring maintenance contracts per pool: frequency, service window, price, template/version.

Auto-generate jobs on a rolling horizon with correct windows and durations.

Provide pause/skip/reschedule logic and keep billing aligned with visits.

2) Scope (in / out)

In

CRUD for ServicePlan

Frequencies: weekly, biweekly, monthly (day-of-week/day-of-month support)

Time windows (start/end), default serviceDurationMin from template (overridable)

Price (per visit or per cycle), currency, tax %, discounts

Rolling job generation (8 weeks ahead by default)

Pause/Resume, Skip Next Visit, and temporary window override

Compute nextVisitAt and maintain a simple schedule calendar per plan

Out (deferred)

Complex cadences (e.g., “1st & 3rd Tue”) → Phase 2

SLA penalties/credits → Phase 2

Automatic invoice subscription plans → Phase 2 (we’ll bill per visit in M9)

3) Success Criteria

Manager can create a plan, see projected visits, and the system generates jobs with correct windows.

Pausing a plan stops new jobs; resume continues from the next valid slot.

Skipping a visit removes/voids the next scheduled job without breaking cadence.

Plans display next visit and last service data; jobs are generated with the right template/version and duration.

4) Interfaces (API contracts)

Plans (Manager/Admin)

GET /service-plans?poolId=&clientId=&active=true|false&page=&limit=&query=
→ list with nextVisitAt, lastVisitAt, price, frequency, status.

POST /service-plans
{
  "poolId":"...", "frequency":"weekly",              // weekly|biweekly|monthly
  "dow":"tue",                                       // for weekly/biweekly: mon..sun
  "dom": null,                                       // for monthly: 1..28 (-1 for last) 
  "window": {"start":"09:00","end":"12:00"},         // local time window
  "priceCents": 18000, "currency":"GHS", "taxPct":0, "discountPct":0,
  "visitTemplateId":"...", "visitTemplateVersion":"latest", // or a number
  "serviceDurationMin": 45,                           // optional override
  "startsOn":"2025-11-01", "endsOn":null,             // optional end date
  "notes":"Back gate access; dog on site"
}


GET /service-plans/:id

PATCH /service-plans/:id (partial; some fields locked if job exists—see rules)

POST /service-plans/:id/pause → { until?: "2025-12-20" }

POST /service-plans/:id/resume

POST /service-plans/:id/skip-next → removes next scheduled job (if any)

POST /service-plans/:id/override-window → { date:"2025-11-05","window":{"start":"13:00","end":"15:00"}}

GET /service-plans/:id/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
→ planned occurrences + job ids where already generated

Generation

POST /plans/generate → { horizonDays?: 56 } (admin task; usually a scheduled worker)

POST /service-plans/:id/generate → generate jobs for a single plan

All times are local to org’s timezone (we’ll store the IANA zone in Org settings later).

5) Data Model

ServicePlan

id uuid, orgId uuid, poolId uuid

frequency text (weekly|biweekly|monthly)

dow text? (mon..sun) — for weekly/biweekly

dom int? (1..28 or -1 for “last”) — for monthly

window_start time, window_end time

serviceDurationMin int (default from template version at creation)

visitTemplateId uuid, visitTemplateVersion int|null (null = “latest at generation time”)

priceCents int, currency text, taxPct numeric, discountPct numeric

startsOn date, endsOn date?, status text (active|paused|ended)

nextVisitAt timestamptz?, lastVisitAt timestamptz?

notes text, createdAt, updatedAt

ServicePlanWindowOverride

id uuid, orgId, planId, date date, window_start time, window_end time, reason text?

Job (from Module 6; used here)

planId, scheduledStart, windowStart, windowEnd, status, assignedCarerId?, sequence?

templateId, templateVersion, durationMin

Indexes

ServicePlan(orgId, poolId)

ServicePlan(orgId, status, nextVisitAt)

ServicePlanWindowOverride(planId, date) unique

6) Security (RLS)

ServicePlan, ServicePlanWindowOverride

SELECT: ADMIN/MANAGER in org; CLIENT can read plans for their pools (read-only); CARER no direct list (will see through jobs).

INSERT/UPDATE/DELETE: ADMIN/MANAGER in org.

All policies via app.user_id, app.org_id, app.role.

7) Scheduling Logic & Business Rules

7.1 Frequency rules

Weekly: next = next occurrence of dow ≥ startsOn. For subsequent, add 7 days.

Biweekly: seed on the first dow ≥ startsOn; thereafter add 14 days.

Monthly:

If dom = 1..28 → that day each month.

If dom = -1 → last day of month.

If date < startsOn, pick next valid monthly date.

7.2 Windows

Default from plan (window_start/end).

If an override exists for a date, use it for that occurrence only.

7.3 Duration & Template

serviceDurationMin on plan overrides the template’s default.

When generating a job: resolve templateVersion: if plan pinned → use that; if “latest” → read latest at generation time and copy to job.

7.4 Horizon generation

Worker runs daily (e.g., 02:15) to ensure D to D+56 days are fully generated.

Idempotent: don’t duplicate jobs; update nextVisitAt based on earliest scheduled job with status in (scheduled, en_route, on_site).

7.5 Pause / Resume

status=paused halts new generation. Existing future jobs remain unless pause is called with cancelFuture=true (optional Phase 2).

resume recalculates nextVisitAt from today to next valid slot.

7.6 Skip next

Removes (or cancels) the next scheduled job and pushes nextVisitAt to the following cadence date.

Does not change cadence anchoring.

7.7 Ends On

If endsOn set, do not generate jobs beyond endsOn.

Setting endsOn in the past → set status=ended.

7.8 Conflicts

If a generated occurrence collides with a public holiday or client blackout (Phase 2), mark as at-risk and surface to Scheduling for manual move.

8) Validation

frequency ∈ {weekly, biweekly, monthly}

For weekly/biweekly: dow required; for monthly: dom required.

window_start < window_end, duration 10–240 minutes.

Price ≥ 0; taxPct/discountPct within sensible bounds (0–30% default cap).

startsOn ≤ endsOn (if endsOn provided).

Cannot change poolId once jobs exist (must end plan and create a new one).

Template pin/unpin allowed; changing template applies only to future generation.

9) UX Contracts

Manager Console

Plans list: Client • Pool • Frequency • Next Visit • Status • Price • Template(v)

Plan detail: Basics • Schedule • Window Overrides • Pricing • Template • Notes

Calendar preview: shows occurrences, job status badges, add override inline.

Actions: Pause/Resume, Skip Next, Generate Now, Duplicate Plan.

Client App

Read-only: show frequency, next visit window; ability to request reschedule (sends thread message).

Carer App

Indirect: jobs appear on Today/Upcoming; no plan editing.

10) Dependencies & Config

Requires Modules 1–4 (Auth/Orgs, Users, Pools, Visit Templates).

Worker (Redis + BullMQ) for nightly generation.

Org timezone config (Phase 2); for now assume Africa/Accra.

11) Cross-Module Boundaries

Jobs & Dispatch (M6): consumes generated jobs; ETA/sequence set later.

Visits (M7): completion updates lastVisitAt; next generation unaffected.

Invoices (M9): by default bill per visit on completion; Phase 2 may add monthly subscription billing mapped to plan.

Notifications (M12): reminders based on plan windows (T-24h, T-1h).

12) Risks & Mitigations

Timezone drift/Daylight issues → windows off.
Mitigation: store local times (time type) + org IANA zone; compute to UTC at job creation.

Missed generation (worker down) → empty schedule.
Mitigation: idempotent “fill horizon” job also runs on demand from console.

Plan edits after generation → confusion.
Mitigation: edits apply only to future occurrences; show diff banner.

13) Observability & Ops

Logs: plan create/update/pause/resume/skip; generation runs (# plans processed, # jobs created).

Metrics: active plans, on-time generation %, nextVisitAt null count (should be ~0), override usage rate.

Alerts: generation failures; plans with >1 missed cycles.

14) Test Plan

Unit: date math for weekly/biweekly/monthly; override selection; nextVisitAt calc.

Integration:

Create weekly plan (Tue 09–12) starting next week → horizon shows 8 occurrences; jobs created.

Pause → no new jobs; resume → jobs created from next valid Tuesday.

Monthly DOM=-1 (last day) across Feb/Apr/May works as expected.

Switch template to pinned v2 → new jobs copy v2; existing jobs unaffected.

RLS: cross-org access denied; client read-only to own pools’ plans.

15) Deliverables

Prisma models + migrations: ServicePlan, ServicePlanWindowOverride (+ minor fields on Job).

RLS SQL policies for both tables.

NestJS ServicePlansController/Service + generation worker (BullMQ).

Manager UI: Plans list + detail + calendar + actions; “Generate Now” control.

Seed: sample weekly/biweekly/monthly plans across a few Accra pools.

16) Acceptance Demo

Create a weekly plan (Tue 09:00–12:00, 45 min, price 180 GHS) → run “Generate Now” → see 8 weeks of jobs with correct windows.

Add a window override for next Tue 13:00–15:00 → job updates its window accordingly.

Pause plan → horizon won’t add more jobs; Resume → fills missing horizon.

Skip Next → next job removed; cadence continues to the following week.

Change template to pinned v2 → new jobs carry templateVersion=2; old jobs unchanged.

Client can read plan summary for their pool; CARER sees jobs only, not the plan.





Module 6 — Jobs & Dispatch (Scheduling, Assignment, Routing)
1) Objectives

Operate the daily work queue: create/track jobs, assign carers, respect service windows/SLA, and optimize routes.

Provide realtime status + ETA to Manager, Carer, and Client apps.

Keep everything org-scoped + RLS-safe.

2) Scope (in / out)

In

Job lifecycle & audit trail

Assignment (single carer v1), bulk assign/unassign

Reschedule within window rules

Route optimization (preview → apply) with Google Distance Matrix

Today’s route (polyline, ordered stops, ETA, distance)

SLA timers (window breach risk), cancellation/failure codes

Out (deferred)

Multi-carer jobs / crews

Skill/vehicle constraints in optimizer (Phase 2)

OR-Tools exact VRP (Phase 2 service)

3) Success Criteria

Manager sees a kanban/table of jobs by date/status and can (re)assign/reschedule in seconds.

Carer sees Today route, navigates stop-by-stop, and completes visits (offline OK).

Client gets clear On the way / On site / Done updates.

Optimization suggests a better sequence with delta metrics; apply updates in one click.

4) Interfaces (API contracts)
Manager (ADMIN/MANAGER)

GET /jobs?date=YYYY-MM-DD&status=&carerId=&clientId=&page=&limit=

GET /jobs/:id

POST /jobs/:id/assign → { carerId }

POST /jobs/:id/unassign

POST /jobs/:id/reschedule → { windowStart, windowEnd, reason }

POST /jobs/:id/cancel → { code: 'CLIENT_REQUEST'|'WEATHER'|'OTHER', reason? }

POST /dispatch/optimize → { date, carerId? } → returns preview (sequence/ETA deltas)

POST /dispatch/apply → { optimizationId } (idempotent)

Bulk: POST /jobs/bulk/assign { jobIds:[], carerId }, POST /jobs/bulk/cancel …

Carer

GET /carers/me/jobs?from&to&status

GET /carers/me/route?date → ordered stops + polyline + summary

POST /jobs/:id/start (→ en_route + ETA calc)

POST /jobs/:id/arrive (→ on_site)

POST /jobs/:id/complete (→ completed) // Module 7 posts visit data

POST /jobs/:id/fail → { code:'NO_ACCESS'|'CLIENT_ABSENT'|'EQUIP_FAILURE'|'OTHER', notes? } (→ failed)

Client (read-only)

GET /clients/me/jobs?from&to (status & windows)

GET /clients/me/jobs/:id (with live status/ETA)

Realtime events: job.assigned, job.updated, job.status, dispatch.suggestion, dispatch.applied.

5) Data Model (adds to prior modules)

Job

id, orgId, poolId, planId?, assignedCarerId?, templateId, templateVersion

scheduledStart timestamptz? (optional exact time)

windowStart timestamptz, windowEnd timestamptz

status enum('scheduled','en_route','on_site','completed','failed','cancelled')

sequence int? (order in carer’s day), etaMinutes int?, distanceMeters int?

slaMinutes int (e.g., 120 window), slaBreachedAt timestamptz?

cancelCode text?, failCode text?, notes text?

createdAt, updatedAt

JobEvent (audit)

id, jobId, orgId, userId?, type, payload jsonb, createdAt
Types: assign|unassign|reschedule|status_change|optimize_apply|cancel|fail.

OptimizationRun

id, orgId, date, carerId?

input jsonb (jobs, coords, windows)

suggestion jsonb (sequence, ETAs, deltas)

appliedAt timestamptz?, createdAt

Indexes

Job(orgId, windowStart), Job(orgId, assignedCarerId, windowStart), partial on status='scheduled'

JobEvent(jobId)

6) Security (RLS)

Job:

SELECT: ADMIN/MANAGER (all in org), CARER (jobs assigned to them), CLIENT (jobs for their pools)

UPDATE (assign/resched/cancel): ADMIN/MANAGER only

UPDATE (status changes start/arrive/complete/fail): assigned CARER + ADMIN/MANAGER

JobEvent, OptimizationRun: SELECT within org; INSERT by server; UPDATE (apply) admins only.
All via app.user_id, app.org_id, app.role.

7) Lifecycle & Business Rules

Status machine
scheduled → en_route → on_site → completed
Or terminal: scheduled → cancelled | scheduled/on_site → failed.

Assignment

Only to active carers.

Unassign clears sequence/ETA for that day.

Reschedule

Must keep same date by default; cross-date moves allowed if not violating plan (flag in UI).

On reschedule, recompute ETA/sequence if already optimized (mark plan “needs re-optimize”).

SLA

SLA monitors arrival within window. If now > windowEnd and not on_site, raise slaBreachedAt.

Risk flag when ETA pushes arrival beyond windowEnd.

Completion

Allowed only after on_site. Visit details come from Module 7; on success set completed.

Failure/Cancel codes (controlled vocab, configurable later).

8) Route Optimization (v1 heuristic)

Inputs: set of jobs for {date, carerId? or all}, start location (carer homeBase or first job), matrices from Google Distance Matrix.

Algorithm: nearest-feasible with time windows → small 2-opt pass → compute sequence, per-stop ETA/distance, total km/time.

Output (preview):
{
  "optimizationId":"opt_123",
  "summary":{"savings_km":7.4,"savings_min":28},
  "route":[
    {"jobId":"j1","fromSeq":3,"toSeq":1,"eta":"09:20"},
    {"jobId":"j2","fromSeq":1,"toSeq":2,"eta":"10:05"}
  ]
}

Apply: persists sequence, recalculates per-job ETA, emits dispatch.applied.

Guardrails: If any job window becomes infeasible, mark atRisk=true and keep original unless manager forces apply.

9) Realtime & Offline

On any assignment/reschedule/status change → emit to:

org:{orgId} (manager boards),

carer:{carerId},

client:{clientId} (limited fields).

Carer app caches Today; offline mutations queue (start/arrive/complete/fail). Server resolves by timestamps (LWW).

10) UX Contracts

Manager Console

Jobs Board (date scoped): columns by status; filters (carer, client, tag).

Row actions: Assign/Unassign, Reschedule, Cancel, Jump to Client/Pool.

Optimize button (per carer or org-wide) → Preview drawer → Apply changes.

Risk badges: “ETA > window”, “Unassigned”, “No coords”.

Carer App

Today: ordered stops with status pills + ETAs, “Optimize Route”.

Job Detail: actions (Navigate, Start, Arrive, Complete/Fail), window + SLA countdown.

Client App

Read-only: visit status; “Message” action opens thread.

11) Dependencies & Config

Requires Modules 1–5.

Google Distance Matrix API key.

Redis queue optimize for background matrix fetch + compute.

12) Cross-Module Boundaries

Service Plans (M5) generate jobs; edits to plans affect future jobs.

Visits (M7) completes jobs and triggers report/invoice flows.

Notifications (M12): use status changes to send reminders/updates.

Analytics (M16): on-time %, avg duration, km/visit.

13) Risks & Mitigations

Bad/missing coords → optimizer fails.
Mitigation: validation at Pool; “No coords” risk badge; exclude from optimize.

Window infeasibility after apply.
Mitigation: precheck; mark at-risk; block apply unless forced.

Offline collisions (two devices).
Mitigation: event audit + LWW; status rules (cannot complete before arrive).

14) Observability & Ops

Logs: assignment, reschedule, optimize preview/apply, status transitions.

Metrics: jobs/day, % optimized, km saved, SLA hit %, breach count.

Alerts: optimize failures; high breach rate; unassigned jobs by 08:00 local.

15) Test Plan

Unit: state machine guards; ETA math; window feasibility; 2-opt swap logic on small sets.

Integration:

Assign → route preview → apply → sequences updated; events emitted.

Reschedule within window; cross-date reschedule with warning.

Carer flow: start → arrive → complete; fail path with codes.

RLS: carer sees only own jobs; client sees only their pool’s jobs; cross-org blocked.

Offline: queued start/arrive/complete reconcile correctly by timestamps.

16) Deliverables

Prisma migrations for Job (final fields), JobEvent, OptimizationRun.

RLS SQL for all three.

NestJS JobsController/Service, DispatchController/Service, optimize worker (BullMQ) + Google Matrix client.

Socket.IO emits wired.

Manager UI: Jobs board + Optimize preview drawer.

Carer endpoints integrated with app’s Today/Job screens.

17) Acceptance Demo

Generate plans (M5) → jobs appear for Nov 5.

Assign 8 jobs to Carer A → click Optimize → preview shows savings → Apply.

Carer uses app: Start first job (status en_route) → Manager sees live ETA; Arrive → Complete (then M7 handles visit).

Manager Reschedules a job; board + carer route update; client sees new window.

Try to complete before arrive → blocked by rule.

Cross-org access attempt → denied by RLS.




Module 7 — Visits (Execution)
1) Objectives

Power the on-site workflow for carers: checklist, readings, chemicals, photos, notes, client signature → mark job completed.

Ensure offline-first capture with robust sync + retries.

Trigger AI report writer and downstream flows (invoice, notifications, quality audit).

2) Scope (in / out)

In

Start/arrive/complete visit flow (tied to Job lifecycle)

Entities: VisitEntry, Reading, ChemicalsUsed, Photo

Checklist completion & required photos (from Template Version)

Client signature capture, rating, feedback

Presigned uploads (MinIO/R2), EXIF ingest & thumbnails

AI Report Composer trigger; Quality Auditor trigger

Out (deferred)

Multi-carer co-visits

On-device chemical inventory decrement (handled later in Inventory P2)

3) Success Criteria

Carer completes a visit entirely offline (3+ photos); sync succeeds within 60s on reconnect.

Manager & Client see a report link ≤ 2 minutes after completion.

Quality Auditor flags anomalies when present; status visible in console.

All records are org-scoped & RLS-safe.

4) Interfaces (API contracts)

Carer calls these; Manager can read; Client reads the final report.

Visit lifecycle

POST /jobs/:id/start → sets Job en_route (M6)

POST /jobs/:id/arrive → sets on_site and opens/creates VisitEntry

POST /jobs/:id/complete

{ "signatureUrl":"s3://...", "notes":"", "rating":5, "feedback":"" }

→ Job completed, VisitEntry completedAt set, kicks AI report + audit

Readings

POST /visits/:visitId/readings

{ "chemical":"liquid_chlorine","qty":450,"unit":"ml","lotNo":"LC-0925","costCents":1200 }

Chemicals

POST /visits/:visitId/chemicals (append)
{ "chemical":"liquid_chlorine","qty":450,"unit":"ml","lotNo":"LC-0925","costCents":1200 }

Photos

POST /visits/:visitId/photos/presign → { key, url, fields }

Client uploads to MinIO/R2 →
POST /visits/:visitId/photos/commit

{ "url":"https://.../org/..../uuid.jpg","label":"before|after|issue","takenAt":"ISO?" }


Checklist

Comes embedded in Job payload (resolved Template Version); client submits completion as part of complete call or as incremental updates:

POST /visits/:visitId/checklist → { "steps": [{"id":"vacuum","done":true,"notes":""}] }

Issues (handoff to M8)

POST /visits/:visitId/issues → { type, severity, description, photos:[url], requiresQuote }

Report

GET /visits/:id/report → { status:'pending|ready|failed', "url?": "https://..." }

Quality

GET /visits/:id/quality → { score: 0..100, flags:[...] } (read-only)

5) Data Model

VisitEntry
id, orgId, jobId, startedAt, arrivedAt, completedAt, clientSignatureUrl?, rating?, feedback?, templateId, templateVersion, createdAt, updatedAt

Reading
id, orgId, visitId, ph?, chlorineFree?, chlorineTotal?, alkalinity?, calciumHardness?, cyanuricAcid?, tempC?, measuredAt

ChemicalsUsed
id, orgId, visitId, chemical, qty?, unit?, lotNo?, costCents?

Photo
id, orgId, visitId, url, label ('before'|'after'|'issue'), takenAt, meta jsonb (exif, width, height, thumbUrl?)

VisitChecklist (optional if storing server-side)
id, orgId, visitId, steps jsonb (array of {id, done, notes?}), completedRequired bool

Indexes

VisitEntry(jobId) (unique 1:1), Reading(visitId), ChemicalsUsed(visitId), Photo(visitId)

6) Security (RLS)

VisitEntry/Reading/ChemicalsUsed/Photo/VisitChecklist

SELECT:

ADMIN/MANAGER: all in org

CARER: visits belonging to jobs assigned to them

CLIENT: visits for pools of the client (read-only)

INSERT/UPDATE: assigned CARER and ADMIN/MANAGER

Enforced using app.user_id, app.org_id, app.role session vars.

7) Validation & Business Rules

State guard: must be on_site before completing.

Checklist required: If template marks a step as required or demands photos>0, ensure corresponding completion/photo exists before allowing complete.

Reading sanity (server clamps/flags but accepts):

pH (6.2–8.6), FC (0–10 ppm), TA (40–240 ppm), CH (100–600 ppm), CYA (0–120 ppm), Temp (5–45 °C).

Chemicals: qty must be positive and within per-visit safety limits (configurable per org; defaults).

Photos: EXIF timestamps accepted; label must be known; size caps (e.g., ≤10 MB).

Idempotency: complete endpoint should be idempotent (return same result if repeated).

8) Offline-first Sync

Client queues mutations locally with timestamps:

arrive, readings, chemicals, photo commit, checklist, complete

Server resolves by occurredAt (client-supplied) favoring latest; append-only for photos, chemicals, readings.

Conflict policy: LWW for scalar fields; additive for arrays (photos/chemicals/notes).

9) AI & Worker Pipelines

On complete → enqueue jobs:

Report Composer: generate HTML/MD report (header with pool info, checklist summary, readings table with target color-coding, before/after gallery, chemicals dosing summary, notes, signature). Save to Files; set report.url; emit visit.completed with link.

Quality Auditor: heuristic checks → produce score (e.g., 0–100) + flags:

Missing required steps/photos

Readings outside targets with no chemicals logged

EXIF/timestamp mismatch vs arrivedAt/completedAt

Duration < template min by threshold

Billing Hook (to M9): create draft invoice if plan says “bill per visit”.

Notifications (to M12): send client “Visit complete” with link (channel per preference).

Dosing Coach (optional pre-complete):
POST /ai/dosing/suggest using pool volume, readings, targets → returns step list; log chosen chemicals.

10) Realtime

Emit to:

org:{orgId}: visit.updated, visit.completed (with report link)

client:{clientId}: visit.status updates; when report ready, visit.report.ready

carer:{carerId}: confirmations and sync acks (optional)

11) UX Contracts

Carer App — Job Detail sections

Summary (window, SLA timer)

Checklist (required items highlighted; photo counters)

Readings (inputs with target color bands)

Chemicals (AI Dosing button; unit picker)

Photos (before/after; background uploads; progress states)

Signature capture

Complete button (disabled until requirements satisfied)

Manager Console

Visit drawer: readings table, chemicals log, photos gallery, signature, audit score/flags, report link

Quick actions: “Create Issue”/“Create Quote”, “Message Client”

Client App

Visit detail page: summary, readings chart, before/after photos, recommendations, downloadable report

12) Dependencies & Config

Depends on M1–M6 (Auth, Users, Pools, Templates, Plans, Jobs).

Files: MinIO/R2; presign uploads.

Workers: report and quality queues.

13) Cross-Module Boundaries

Jobs (M6): status transitions; completion updates job → triggers M7 pipelines.

Issues & Quotes (M8): created from visit context (photos/notes).

Invoices & Payments (M9): draft invoice per visit if configured.

Inbox (M10): client replies route to thread referencing the visit.

Analytics (M16): duration vs planned, audit scores, chemical cost/visit.

14) Risks & Mitigations

Poor connectivity → stalled uploads.
Mitigation: presigned, chunked retries; local queue; show progress and allow later completion when back online.

Bad data entry (typos).
Mitigation: input ranges + target banding + confirm dialogs + AI dose helper.

Photos without consent in sensitive areas.
Mitigation: policy notice in app; label control; server-side blur (Phase 2).

15) Observability & Ops

Logs: timestamps for arrive/complete deltas, counts of readings/chemicals/photos per visit.

Metrics: % visits completed < 2 min after arrive, report TAT, average photos/visit, audit score distribution.

Alerts: report composer failures; high audit flag rate.

16) Test Plan

Unit: validators for readings/chemicals; required checklist logic.

Integration:

Arrive → add readings + chemicals + photos → Complete → report ready link visible to Manager/Client.

Required step/photo missing → Complete blocked.

Offline queue replay produces correct ordering & dedup.

RLS: carer only sees own visits; client only their pools’ visits; cross-org denied.

Performance: 10k photos/day pipeline stays < 2 min report TAT (batch image processing).

17) Deliverables

Prisma migrations for VisitEntry, Reading, ChemicalsUsed, Photo (and optional VisitChecklist).

RLS SQL policies for all visit tables.

NestJS VisitsController/Service (readings/chemicals/photos/complete), presign + commit endpoints.

Worker processors: report (HTML/MD → stored), quality (rules/score).

Manager UI: Visit drawer; Client UI: Visit detail page.

Carer UI: Job Detail sections wired to endpoints; offline queue & retries.

18) Acceptance Demo

Carer arrives, records readings, uses Dosing Coach, logs chemicals, snaps before/after photos, captures signature, and completes the visit offline; after reconnect, everything syncs.

Manager sees visit with readings, chemicals, photos, signature; report link shows within 2 minutes; quality score displays with any flags.

Client opens the app, views the completed visit, and downloads the report.

RLS checks: another org can’t access the visit; a different client can’t see it.

Module 8 — Issues & Quotes (Upsell & Repairs)
1) Objectives

Let carers/managers flag problems found during a visit (leaks, pump noise, cracked tiles, etc.).

Convert issues into itemized quotes for client approval with photos and notes.

Drive work downstream (approved quote → job(s) + billing).

2) Scope (in / out)

In

Create/read/update Issue (severity, status, photos, linkage to visit/pool)

Create/read/update Quote (items, totals, status: pending/approved/rejected)

Client approval flow (app link + thread message)

Optional follow-up job creation after approval (simple single job v1)

AI helpers: extract parts & labor from issue text/photos (draft quote)

Out (deferred)

Multi-quote per issue comparison (v2)

Complex approvals (partial line acceptance, multi-signers)

Purchase orders & supplier integration (v2)

3) Success Criteria

Carer can log an issue in ≤30s with photos while on site.

Manager can generate a quote in ≤2 min (AI draft → edit → send).

Client can approve from phone; system creates a follow-up job and draft invoice.

Full org scoping and audit trail preserved.

4) Interfaces (API contracts)
Issues

POST /visits/:visitId/issues
{
  "type":"pump_noise",
  "severity":"medium",         // low|medium|high|critical
  "description":"Pump bearings noisy; flow reduced",
  "photos":["https://.../photo1.jpg","https://.../photo2.jpg"],
  "requiresQuote": true
}

GET /issues?poolId=&status=&severity=&page=&limit=&query=

GET /issues/:id

PATCH /issues/:id → { status, description?, requiresQuote? }

status: open | quoted | scheduled | resolved | dismissed

Quotes

POST /quotes
{
  "issueId":"...", "poolId":"...", "currency":"GHS",
  "items":[
    {"sku":"LC-10","label":"Liquid chlorine (20L)","qty":1,"unitPriceCents":150000,"taxPct":0},
    {"sku":"LAB-1","label":"Labor (1.5h)","qty":1.5,"unitPriceCents":6000,"taxPct":0}
  ],
  "notes":"Includes disposal of old chemicals"
}

GET /quotes?poolId=&status=&clientId=&page=&limit=

GET /quotes/:id

PATCH /quotes/:id → edit items/notes while status=pending

POST /quotes/:id/approve → { approvedBy?: "client_user_id" }

POST /quotes/:id/reject → { reason?: "..." }

POST /quotes/:id/create-job → creates one follow-up job (v1)

{ "windowStart":"2025-11-06T09:00:00Z","windowEnd":"2025-11-06T12:00:00Z","assignedCarerId":null,"notes":"Bring bearing kit" }

AI Assist

POST /ai/quote/from-issue → { issueId } → returns draft items[] + notes

Client-side

GET /clients/me/quotes (list)

GET /clients/me/quotes/:id

POST /clients/me/quotes/:id/approve / reject

Realtime events: issue.created, issue.updated, quote.created, quote.updated, quote.approved.

5) Data Model

Issue
id, orgId, visitId, poolId, type text, severity enum, description text, status text('open'|'quoted'|'scheduled'|'resolved'|'dismissed'), requiresQuote bool, createdBy userId, createdAt, updatedAt

IssuePhoto (or reuse Photo with label='issue')
id, orgId, issueId, url, takenAt, meta jsonb

Quote
id, orgId, issueId?, poolId, clientId, status text('pending'|'approved'|'rejected'), currency text, items jsonb, subtotalCents int, taxCents int, totalCents int, notes text?, approvedAt?, rejectedAt?, approvedBy?, createdAt, updatedAt

QuoteAudit
id, orgId, quoteId, userId?, action text('create'|'edit'|'approve'|'reject'|'create_job'), payload jsonb, createdAt

Follow-up linkage

On approve + create-job: Job.quoteId=quote.id, Issue.status='scheduled'

When follow-up job completes, set Issue.status='resolved'

Indexes

Issue(orgId, poolId, status, severity)

Quote(orgId, clientId, status)

Quote(issueId) unique (if 1:1 in v1)

6) Security (RLS)

Issue / IssuePhoto

SELECT: ADMIN/MANAGER (org), CARER assigned to the visit’s job, CLIENT owning the pool

INSERT/UPDATE: ADMIN/MANAGER, assigned CARER (to create/update while visit is active)

Quote / QuoteAudit

SELECT: ADMIN/MANAGER; CLIENT can read own quotes; CARER read-only if linked to issue’s visit

INSERT/UPDATE: ADMIN/MANAGER

Approve/Reject: CLIENT (self) or ADMIN (on phone confirmation—with audit)

All policies via app.user_id, app.org_id, app.role.

7) Validation & Business Rules

Issue

severity ∈ { low, medium, high, critical }

status transitions:

open → quoted (when a quote is created)

quoted → scheduled (after approve + create job)

scheduled → resolved (follow-up job completes)

Any → dismissed (manager close)

Quote

While pending: items editable; after approved/rejected: locked

Items schema: { sku?, label(2..120), qty>0, unitPriceCents≥0, taxPct 0..30 }

Totals recalculated server-side; currency per org/client country

Client Actions

Approve requires identity (logged-in or signed link with one-time token)

Rejection records reason (optional)

Create Job

Requires pool coords; uses Repair/Extra Work template/version (org default)

Sets job notes = quote summary + link

Invoice Hook (M9)

On approve → create draft invoice for totalCents (or on completion—configurable)

If prepayment required (toggle), block create job until payment captured (v2)

8) UX Contracts

Manager Console

Issues tab: filters (severity, status), quick actions: “Create Quote”, “Schedule Follow-up”, “Mark Resolved/Dismissed”

Issue drawer: photos gallery, visit snippet, pool context, client thread panel

Quotes tab: list with status badges, total, last updated

Quote editor: line items table (add/remove, qty, price, tax), live totals, notes, Send to Client

Approval timeline with audit trail

Carer App

From Visit → “Report an Issue” sheet: type/description, add photos, toggle requires quote

Read-only view of quotes related to their recent visits

Client App

Quotes list → Detail with line items, photos & notes, Approve or Reject with 1-tap + confirmation

9) AI Helpers

/ai/quote/from-issue: Given issue text + photo tags, propose:

Parts (SKU if known), labor hours, recommended chemicals

Draft notes with safety disclaimers

Manager accepts/edits before sending.

10) Dependencies & Config

Depends on M1–M7 (Auth, People, Pools, Templates, Plans, Jobs, Visits)

Files/Uploads for issue photos

Optional org defaults: repair template, prepayment policy, tax rate

11) Cross-Module Boundaries

Visits (M7) create Issues; quotes reference Issues/Pools/Clients

Jobs (M6) receive follow-up jobs from approved quotes

Invoices (M9) draft/collect payment for quotes

Inbox (M10) “Send Quote” posts a thread message + link; client replies tracked

Analytics (M16): issue volume by type, quote conversion rate, avg ticket value, approval TAT

12) Risks & Mitigations

Scope creep on follow-up repairs.
Mitigation: v1 single job; add multi-job projects in v2.

Sticker shock → low approvals.
Mitigation: AI suggests alternatives (good/better/best) in notes; optional discount field.

Client identity on approvals.
Mitigation: signed one-time links + device fingerprint; audit log.

13) Observability & Ops

Logs: issue create/update, quote create/edit/send/approve/reject, job creation from quote

Metrics: issues/week, quotes sent, approval rate, median approval time, avg quote value

Alerts: quotes stuck pending > 14 days; high rejection rate

14) Test Plan

Unit: item total math; status transitions; AI draft sanitizer

Integration:

Carer creates issue with photos; manager drafts quote (AI) → edits → sends → client approves → follow-up job created.

Reject path records reason and locks quote.

Attempt to edit approved quote → blocked.

RLS:

Client can see only own pool issues/quotes.

Carer cannot view unrelated org/client quotes.

Edge cases: delete issue photo, dismiss issue after quote rejected, re-open issue → new quote allowed.

15) Deliverables

Prisma models + migrations: Issue, IssuePhoto (or reuse Photo), Quote, QuoteAudit (+ Job.quoteId)

RLS SQL policies for all

NestJS IssuesController/Service, QuotesController/Service, AI draft endpoint

Manager UI pages (Issues list, Quote editor), Client UI (Quotes), Carer issue sheet

Worker/email templates for “Quote sent” notifications

16) Acceptance Demo

During a visit, carer logs an issue (photos, requires quote).

Manager opens issue → clicks Generate Quote (AI) → edits items → Send.

Client opens link on phone → Approve; system creates a follow-up job and a draft invoice.

Manager sees realtime quote.approved; Jobs board shows the new repair job.

After repair visit completes, Issue auto-moves to resolved.

Cross-org / unauthorized access attempts → denied by RLS.




Module 9 — Invoices & Payments (Paystack)
1) Objectives

Bill for visits and quotes/repairs, collect money via Paystack, and reflect real-time payment status across Manager/Client apps.

Support deposits/part-payments, refunds/credit notes, receipts, and statements.

Keep everything org-scoped with RLS and auditable.

2) Scope (in / out)

In

Invoice lifecycle: draft → sent → paid | overdue | void

Sources: Visit (per-visit billing), Quote (approved repair), Ad-hoc (manual)

Line items (parts/labor/chemicals), tax & discounts, currency

Paystack: initialize transaction, verify webhook, reconcile Payment rows

Part-payment & deposits; multiple payments per invoice

Refunds & Credit Notes (apply to invoice or future invoices)

Receipts (PDF/HTML) & Client statements (CSV/PDF)

DSO/aging dashboard

Out (deferred)

Full subscriptions (monthly autopay) → Phase 2

FX conversion & multi-currency settlement → Phase 2

3) Success Criteria

On visit complete or quote approval, a draft invoice is created automatically (configurable).

Manager can send the invoice; Client pays via Paystack; status flips to paid within seconds via webhook.

Part-payment works; receipts generated; statements downloadable.

Credit Notes reduce balance or refund; RLS and audit trail intact.

4) Interfaces (API contracts)
Invoices

GET /invoices?clientId=&status=&source=visit|quote|manual&from=&to=&page=&limit=

POST /invoices
{
  "clientId":"...", "currency":"GHS",
  "items":[
    {"label":"Weekly Service (45 min)","qty":1,"unitPriceCents":18000,"taxPct":0},
    {"label":"Liquid Chlorine (450ml)","qty":1,"unitPriceCents":1200,"taxPct":0}
  ],
  "discountPct":0, "notes":"Thank you", "source":{"type":"visit","id":"visitId"}
}

GET /invoices/:id

PATCH /invoices/:id (editable while draft|sent and no payments > 0)

POST /invoices/:id/send → marks sent, dispatches message/email

POST /invoices/:id/void → only if balance = total and not paid

GET /invoices/:id/pdf (server renders HTML→PDF)

Payments (Paystack)

POST /invoices/:id/pay/paystack → init transaction
Request: { amountCents?: number } (defaults to outstanding balance)
Response: { authorization_url, reference }

POST /webhooks/paystack (public)

Verify signature → upsert Payment → recalc invoice balance → emit invoice.paid|part_paid.

GET /payments?clientId=&invoiceId=&from=&to=

Credit Notes & Refunds

POST /invoices/:id/credit-notes
{ "reason":"Overcharge on chemicals", "items":[{"label":"Adjustment","qty":1,"unitPriceCents":-1200}], "applyNow": true }


→ creates CreditNote and (optionally) applies to invoice

POST /payments/:id/refund → attempts Paystack refund (when supported) and creates Refund row

GET /credit-notes?clientId=&invoiceId=

GET /credit-notes/:id

Receipts & Statements

GET /invoices/:id/receipt (HTML/PDF)

GET /clients/:id/statement?from=&to=&format=pdf|csv

Realtime events: invoice.created, invoice.sent, invoice.updated, invoice.paid, invoice.part_paid, creditnote.created.

5) Data Model (extends existing)

Invoice
id, orgId, clientId, jobId?, quoteId?, source jsonb? (type,id),
status text('draft'|'sent'|'paid'|'overdue'|'void'),
currency text, subtotalCents int, taxCents int, discountCents int, totalCents int, balanceCents int,
paystackRef text?, issuedAt, dueAt?, notes text, createdAt, updatedAt

InvoiceItem (optional if not keeping items in jsonb)
id, orgId, invoiceId, label, qty numeric, unitPriceCents int, taxPct numeric, totalCents int

Payment
id, orgId, invoiceId, amountCents int, method text('paystack'|'cash'|'bank'), providerRef text?, paidAt timestamptz, meta jsonb, createdAt

CreditNote
id, orgId, clientId, invoiceId?, reason text, items jsonb, amountCents int, createdAt, appliedAt?

Refund
id, orgId, paymentId, amountCents int, providerRef text?, refundedAt timestamptz, meta jsonb

AgingSnapshot (optional materialized view or table)
orgId, asOfDate, bucket_current, bucket_1_30, bucket_31_60, bucket_61_90, bucket_90_plus, dso_days

Indexes

Invoice(orgId, clientId, status, dueAt)

Payment(invoiceId), CreditNote(clientId)

Partial index for status='overdue'

6) Security (RLS)

Invoice / InvoiceItem / Payment / CreditNote / Refund

SELECT: ADMIN/MANAGER within org; CLIENT can read their invoices/payments/credit notes; CARER no access by default.

INSERT/UPDATE/DELETE: ADMIN/MANAGER only (webhook inserts Payment server-side).

All enforced via app.user_id, app.org_id, app.role.

7) Validation & Business Rules

Totals recalculated server-side:
subtotal = Σ(line.qty * unitPrice), tax = Σ(line.total * taxPct), discount = percent or amount, total = subtotal + tax – discount, balance = total – Σ(payments) – Σ(creditNotesApplied).

Status transitions:

draft → sent (when sent)

sent → paid (balance 0) | sent → overdue (after due date)

sent/draft → void (only if no payments & no credit applied)

Part-payment: if payments < total, status sent (or part_paid as a derived UI badge), balance > 0.

Refunds: reduce total collected; if refund exceeds payments on invoice, convert remaining to Credit Note for client wallet (v1 simple).

Due date: default issuedAt + 7 days (configurable per org).

Currency: keep as GHS (default); accept per-invoice override; avoid FX math in v1.

Idempotency: webhook uses providerRef/reference to avoid double credit.

8) Paystack Flow (happy path)

Manager clicks Send Invoice (or system auto-sends).

Client taps Pay → backend POST /invoices/:id/pay/paystack with requested amount (balance or deposit).

Backend calls Paystack Initialize Transaction with amount, email, reference, metadata: { orgId, invoiceId } → returns authorization_url.

Client completes checkout.

Paystack sends Webhook → we verify x-paystack-signature → if success, upsert Payment with providerRef=reference and amount.

Recompute balanceCents; if 0, set status='paid', emit invoice.paid; else emit invoice.part_paid.

Generate receipt and notify client/manager.

Manual methods (cash/bank) supported via POST /payments (admins only).

9) Receipts & Statements

Receipt: includes org info, client, invoice ref, items, amount paid, method, date, remaining balance, and a QR code to verify.

Statement: running balance per client between from and to with columns [Date, Doc#, Type (INV/PAY/CN/RF), Description, Debit, Credit, Balance]. Export CSV/PDF.

10) UX Contracts

Manager Console

Invoices list: filters (status, overdue), sort by due date; bulk actions: send reminders.

Invoice editor (draft): line items table, tax/discount controls, preview; “Send”.

Payment timeline on the invoice detail; add manual payment; issue credit note; refund.

Client ledger & statement download; Aging/DSO widgets on Finance dashboard.

Client App

Billing screen: list of invoices with status and balances; invoice detail → Pay; receipts & statements.

11) Dependencies & Config

Depends on M1–M8; receives triggers from M7 (visit complete) and M8 (quote approve).

Paystack secrets in env; webhook route exposed publicly with secret verification.

Email/SMS/WhatsApp templates for invoice sent/paid/reminders.

12) Cross-Module Boundaries

Visits (M7): can auto-create draft invoice (per-visit billing policy).

Quotes (M8): on approve, create draft invoice for quote total (or require prepayment toggle).

Notifications (M12): reminders (T-3d, Due day, Overdue) and payment confirmations.

Analytics (M16): revenue, DSO, aging, collection rate, average days to pay.

13) Risks & Mitigations

Webhook spoofing → verify signature; optionally confirm via Paystack verify API on mismatch.

Under/over-collection with part-payments → server recalculates and shows remaining balance clearly.

Chargebacks/refunds not mirrored → scheduled reconciliation job compares last 7 days with Paystack API (Phase 2).

Data entry errors → restrict edits after payments; use credit notes for adjustments.

14) Observability & Ops

Logs: invoice create/send/void, webhook events, payment upserts, credit/refund actions.

Metrics: invoices sent, paid %, average value, median time-to-pay, overdue count, aging buckets, credits issued.

Alerts: webhook failures, high refund/chargeback rates, overdue growth.

15) Test Plan

Unit: totals math; discount & tax combinations; status transitions.

Integration:

Visit → draft invoice → send → Paystack init → webhook → payment recorded → status paid → receipt generated.

Part-payment (50%) → balance remains; second payment clears.

Credit Note applied reduces balance; refund creates Refund row.

Void blocked when payment exists.

RLS: client sees only their invoices/payments; cross-org blocked; webhook inserts scoped by orgId in metadata.

16) Deliverables

Prisma migrations: InvoiceItem (if splitting), CreditNote, Refund (and any missing fields on Invoice/Payment).

RLS SQL for Finance tables.

NestJS controllers/services: Invoices, Payments, CreditNotes, Receipts/Statements.

Paystack webhook handler with signature verification.

Manager & Client UI pages (lists, detail, pay flow), receipt/statement renderers (HTML→PDF).

17) Acceptance Demo

Complete a visit → system creates draft invoice with items.

Manager sends invoice; Client pays part via Paystack; webhook updates to part-paid; receipt issued for that amount.

Client pays remaining balance; invoice becomes paid; final receipt issued.

Manager issues a credit note for ₵12; balance adjusts; download updated statement.

Attempt to void a paid invoice → blocked; RLS checks pass (clients only see their data).




Module 10 — Inbox & Chat (Omni-channel Threads + AI Replies)
1) Objectives

Centralize WhatsApp, SMS, Email, and in-app conversations into org-scoped threads tied to Clients, Pools, Jobs, Visits, and Invoices.

Provide a 3-pane manager console (folders/filters • thread list • message pane) and AI suggested replies.

Power notifications, approvals (quotes), invoice links, and service updates in one place.

2) Scope (in / out)

In

Entities: Thread, Participant, Message, Attachment, ChannelWebhookLog

Channels: WhatsApp (Cloud API/Twilio/Meta BSP), SMS (Deywuro), Email (SMTP/IMAP-lite send only v1)

Auto-threading by client contact; link to pool/job/visit/invoice/quote

Typing indicators / read receipts (where channel supports)

AI: intent classification + 3 suggested replies + smart snippets (invoice link, reschedule CTA)

Canned responses & variables (e.g., {client.firstName}, {invoice.link})

Out (deferred)

Full IMAP sync of historical email (v2)

Voice calls & transcripts (v2)

Rich WhatsApp templates management UI (v2)

3) Success Criteria

Incoming messages from any supported channel land in the correct org thread within <2s.

Manager replies from the console and the message is delivered on the original channel.

AI suggestions reduce reply time; insert structured links (quote/invoice/report) with one click.

RLS guarantees threads/messages are visible only to their org and relevant app users.

4) Interfaces (API contracts)
Webhooks (public)

POST /webhooks/whatsapp → upsert Thread (by phone), create Message (role=client)

POST /webhooks/sms → same as above

POST /webhooks/email (optional v1 for inbound relay)

Each stores raw payload in ChannelWebhookLog (for audit & retries).

Manager Console

GET /threads?folder=inbox|unread|awaiting_client|archived&query=&clientId=&tag=&page=&limit=

GET /threads/:id → thread header + last 50 messages + participants + links

POST /threads/:id/messages
{ "text":"Hi {client.firstName}, your technician is on the way.", "attachments":[{"url":"...","mime":"image/jpeg"}] }

POST /threads/:id/archive / unarchive

POST /threads/:id/read (mark read)

POST /threads/:id/participants (add/remove internal watchers)

AI: POST /threads/:id/suggest-replies → returns 2–3 options with confidence + intents

Canned: GET /canned-replies, POST /canned-replies

Carer App (light)

GET /carers/me/threads?date=YYYY-MM-DD (threads related to today’s jobs)

POST /threads/:id/messages (carer role) — optional, org-configurable

Client App (in-app channel)

GET /clients/me/threads

POST /clients/me/threads/:id/messages

Link helpers

POST /threads/:id/link → { type:'job'|'visit'|'invoice'|'quote'|'pool', id:'...' }

GET /threads/:id/links → list of linked objects

Realtime events: inbox.thread.created, inbox.message.created, inbox.thread.updated, inbox.typing.

5) Data Model

Thread
id, orgId, clientId?, channelPrimary ('whatsapp'|'sms'|'email'|'inapp'), subject?, lastMessageAt, status('open'|'archived'), tags text[], unreadCount int, createdAt, updatedAt

Participant
id, orgId, threadId, userId? (internal), role('manager'|'carer'|'client'), displayName?

Message
id, orgId, threadId, senderRole('manager'|'carer'|'client'|'system'), channel('whatsapp'|'sms'|'email'|'inapp'), text, attachments jsonb[], meta jsonb (delivery status, provider ids), createdAt

Attachment (optional table if you want fine control)
id, orgId, messageId, url, mime, size, width?, height?, createdAt

ThreadLink
id, orgId, threadId, targetType, targetId, createdAt
Target types: pool|job|visit|invoice|quote|service_plan

ChannelWebhookLog
id, orgId?, provider('whatsapp'|'sms'|'email'), payload jsonb, receivedAt, processedAt?, error?

Indexes

Thread(orgId, lastMessageAt DESC), partial on status='open'

Message(threadId, createdAt)

ThreadLink(threadId, targetType, targetId)

6) Security (RLS)

Thread / Message / Participant / ThreadLink

SELECT: ADMIN/MANAGER in org; CLIENT can read threads where clientId is theirs (channel-limited view); CARER can read threads linked to their assigned jobs/visits for the active day (read-only unless enabled).

INSERT: ADMIN/MANAGER; CLIENT may insert on their own in-app threads; CARER may insert if org allows.

UPDATE: ADMIN/MANAGER; archive/unarchive only admins/managers.

Enforce via app.user_id, app.org_id, app.role. Webhook routes set orgId via phone/email → client lookup, else drop to unassigned queue for manual claim.

7) Routing & Threading Logic

Key: normalize phone/email; lookup Client by primary contact within org.

If found → find open thread with same contact (by channelPrimary), else create new.

If not found → create unassigned thread (clientId=null) and tag UNMATCHED; console shows “Match to client” action.

Link to context when payload includes invoice/quote/job refs (deep links in our outbound messages).

8) AI: Intent & Suggested Replies

Endpoint POST /threads/:id/suggest-replies does:

Classify intent: billing, reschedule, feedback, quote approval question, general.

Generate 2–3 short replies with placeholders expanded and relevant links automatically (e.g., {invoice.link}, {quote.link}, {reschedule.link}).

Confidence score; if low, show safer generic options.

Safety: never hallucinate amounts/dates—pull live values via thread links (invoice total, job window).

9) Templates & Variables

Canned replies stored with variables supported: {client.firstName}, {org.name}, {job.window}, {invoice.balance}, {visit.report.link}.

On send, variables are resolved server-side using linked objects; missing data falls back to blanks or prompts.

10) Delivery & Status

Outbound adapter per channel:

WhatsApp: send text + media; handle template vs session messages; store providerMessageId; track delivered/read when available.

SMS: Deywuro send; map delivery callbacks to Message.meta.

Email: SMTP send; optional open tracking pixel (Phase 2).

In-app: Socket.IO emit to client:{clientId} + persist Message.

Retries with backoff; failed sends surface as red badges.

11) UX Contracts

Manager Console (3-pane)

Left: Folders (Inbox, Unread, Awaiting Client, Unmatched, Archived), quick filters (Billing, Scheduling, Quotes).

Middle: Thread list (client name, last message preview, time, unread count, tags).

Right: Conversation pane with composer (attachments, canned replies, AI suggestions button), context sidebar: Client card, Linked objects, Quick Actions (Copy invoice link, Create plan, Schedule job).

Carer App

Optional Inbox tab: threads for today’s assigned jobs; reply with canned messages (e.g., “On my way”).

Client App

Messages tab: thread list; push notifications; approve quotes & pay invoices via links.

12) Dependencies & Config

Requires M1–M9 (for linking to jobs/visits/quotes/invoices).

Provider creds: WhatsApp/Twilio/BSP, Deywuro SMS, SMTP.

URL shortener (optional) for neat links.

13) Cross-Module Boundaries

Quotes (M8): “Send Quote” posts message with approval link; approval reply updates thread.

Invoices (M9): “Send Invoice/Receipt”; payment confirmation echoes into thread.

Jobs/Visits (M6/M7): status changes fan out (“On the way”, “Completed”, report link).

Notifications (M12): unified scheduling via thread send; delivery receipts flow back here.

Analytics (M16): response time, SLA on replies, channel mix.

14) Risks & Mitigations

Contact mismatch → wrong client thread.
Mitigation: strict normalization + manual “Match to client” flow + audit log.

Channel policy violations (WhatsApp templates).
Mitigation: use approved templates for 24h-window breaks; show template picker.

PII leakage.
Mitigation: RLS + scoped payloads; redact sensitive fields in logs; encrypt provider credentials.

15) Observability & Ops

Logs: webhook receipts, message sends, delivery state transitions.

Metrics: inbound msgs/day, first response time, resolution time, channel deliverability, AI suggestion acceptance rate.

Alerts: webhook failures, provider 4xx/5xx spikes, backlog of UNMATCHED threads.

16) Test Plan

Unit: normalizers (phone/email), intent classification fallbacks, template variable resolution.

Integration:

Inbound WhatsApp → thread create/link → manager reply → delivery receipt updates.

Unmatched inbound → assign to client → messages merge.

AI suggest → pick response → variables resolve correctly with invoice link.

SMS/Email send; attachment handling.

RLS: cross-org isolation; client can only see their threads; carer limited to job-related threads (if enabled).

17) Deliverables

Prisma models + migrations: Thread, Participant, Message, ThreadLink, ChannelWebhookLog.

RLS SQL policies for all inbox tables.

Providers: WhatsApp, SMS (Deywuro), Email adapters; unified send service.

NestJS controllers: Webhooks, Threads, Messages, AI suggestions.

Manager UI: 3-pane Inbox with AI & canned replies; Client App: Messages; optional Carer Inbox.

Seed: Sample threads & canned replies.

18) Acceptance Demo

Customer WhatsApps “Can we move tomorrow’s visit to afternoon?” → webhook creates/updates thread.

Manager opens Inbox, hits AI Suggest → chooses reply with reschedule link → customer confirms.

Send invoice from thread; customer pays; webhook posts payment confirmation message.

A quote is sent; customer presses Approve; thread displays approval and system creates job (from M8).

Verify RLS by attempting cross-org access → denied; delivery receipts update message meta in real time.




Module 11 — Files & Storage (MinIO/R2, Presigned, Secure Delivery)
1) Objectives

Handle safe, fast uploads (photos, signatures, reports, PDFs) with presigned flows from mobile/web.

Generate thumbnails, store EXIF/metadata, and serve files via signed URLs (private by default).

Keep everything org-scoped and auditable; work offline with retries.

2) Scope (in / out)

In

Presigned POST/PUT for uploads to object storage (MinIO on VPS or Cloudflare R2)

File registry & metadata: EXIF, dimensions, size, content type, checksum

Background processors: thumbnail (e.g., 1280px + 320px), EXIF extraction, optional orientation fix

Secure delivery: short-lived signed GET; optional public proxies for reports with expiring tokens

Virus/malware basic check (size/type whitelists; ClamAV optional)

Quotas & lifecycle policies (archival tier rules, retention)

Out (deferred)

End-user shared drives/folders

In-browser image editing (crop/blur) → Phase 2

Full document text extraction/search (Phase 2)

3) Success Criteria

Carer can upload photos offline; client sees report images within 2 min after reconnect.

All files are private by default; access only via signed GET with org scoping.

Thumbs load quickly in mobile lists; original stored unchanged.

RLS blocks cross-org file access.

4) Interfaces (API contracts)
Presign & Commit

POST /files/presign
{
  "scope": "visit_photo",            // enum
  "refId": "visit_123",
  "contentType": "image/jpeg",       // validated
  "fileName": "before.jpg",          // optional
  "sizeBytes": 1840234               // optional hint
}


→ { url, method, fields?, headers?, key }
(S3 POST policy or PUT SAS depending on backend)

Client uploads directly to storage, then:

POST /files/commit

{ "key":"org/ORGID/visits/visit_123/uuid.jpg", "scope":"visit_photo", "refId":"visit_123" }


→ returns file record and queued processing job.

Signed Access

POST /files/sign

{ "fileId":"...", "variant":"original|xl|thumb", "ttlSec":300 }

→ { url } (time-limited GET).
Managers/Carers/Clients must have rights to the underlying referenced entity.

Bulk Helpers

POST /files/bulk/sign → sign multiple fileIds for gallery screens.

DELETE /files/:id → soft delete (org managers only).

Variants: original, xl (max 1280), thumb (320). Non-images return only original.

5) Data Model

FileObject
id uuid, orgId uuid, scope text, refId text, storageKey text, storageBucket text, contentType text, sizeBytes int, checksum text (sha256), width int?, height int?, exif jsonb?, variants jsonb? ({"xl":"...","thumb":"..."}), uploadedAt timestamptz, deletedAt?

FileAudit
id, orgId, fileId, action('create'|'commit'|'variant'|'soft_delete'), userId?, payload jsonb, createdAt

Indexes

FileObject(orgId, scope, refId)

FileObject(orgId, uploadedAt DESC)

Partial index on deletedAt IS NULL

Scopes (enum)

visit_photo, visit_signature, pool_attachment, issue_photo, quote_attachment, invoice_pdf, receipt_pdf, report_html, report_pdf, user_avatar, misc

6) Security (RLS)

FileObject / FileAudit

SELECT:

ADMIN/MANAGER: any file in org

CARER: files linked to their jobs/visits (via scope/refId join)

CLIENT: files linked to their pools/visits/invoices they own

INSERT: any authenticated user creating files for objects they can write to (e.g., carer can add visit_photo to own visit)

UPDATE/DELETE: ADMIN/MANAGER (soft delete)

Enforced with app.user_id, app.org_id, app.role.

POST /files/sign validates access to the referenced entity (e.g., visit/invoice) before issuing signed GET.

7) Storage Backends
A) MinIO on VPS

Bucket: poolcare (private)

Path Convention: org/{orgId}/{scope}/{refId}/{uuid}.{ext}

Presign: S3 POST policy or PUT (server returns url + fields)

Signed GET: server generates pre-signed URL (short TTL)

B) Cloudflare R2

Same path convention; consider R2 signed URL or Cloudflare Signed URL via CDN (private buckets)

CDN/Cache:

Optional Nginx caching for xl/thumb; respect short TTLs.

8) Processing Pipeline (Workers)

Queue files.process on commit:

Head the object → verify size/contentType; compute sha256 if not provided (stream).

If image: decode → autorotate (EXIF), extract EXIF → store exif.

Generate variants: xl (≤1280px), thumb (≤320px); write to storageKey + .xl.jpg, .thumb.jpg; update variants.

For PDFs/HTML (reports/receipts): no image variants; optionally render PDF preview (Phase 2).

Optional ClamAV scan (if enabled) → quarantine or delete on detection.

Emit file.processed events for UI to refresh galleries.

9) Validation & Business Rules

Whitelisted types: image/jpeg, image/png, image/webp, application/pdf, text/html (reports), image/heic (convert to jpg if supported).

Max size: images ≤ 15 MB (configurable), PDFs ≤ 20 MB.

Rate limits: per user per minute to prevent abuse.

Commit window: presign expires (e.g., 10 minutes). Uncommitted keys cleaned by cron.

Checksum (optional): client may send, server validates during commit; prevent accidental re-upload.

Deletion: soft delete (set deletedAt), keep objects; background lifecycle policy can purge after N days.

10) Offline-First Flows

Mobile app stages photo locally → requests presign when online → uploads → commit with local occurredAt.

If commit fails, queue retry with exponential backoff.

Allow out-of-order commits; visits/photos list dedupes by checksum.

11) UX Contracts

Carer App

Photo gallery component with background upload progress; retry badges; shows thumb first, taps to xl/original.

On poor network, allow complete visit once required photos are queued (server validates when committed; if missing after grace, flag in Quality Auditor).

Manager Console

File picker in Visit/Pool/Issue drawers; bulk sign for gallery; download originals; view EXIF; quick copy of signed link (short TTL).

Client App

Only sees files tied to their objects (e.g., report PDFs, visit photos). Links are short-lived; app fetches fresh signed URLs silently.

12) Dependencies & Config

Requires M1 session vars; integrates with M7 (Visits), M8 (Issues), M9 (Receipts/Invoices), M4/M7 (Reports).

Env:
STORAGE_PROVIDER=minio|r2
S3_ENDPOINT=https://minio.local
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=poolcare
FILE_SIGN_TTL_SEC=300
IMAGE_MAX_MB=15
PDF_MAX_MB=20
ENABLE_CLAMAV=false

Image lib: sharp/libvips in worker container.

13) Cross-Module Boundaries

Visits (M7): photos & signatures (visit_photo, visit_signature)

Issues/Quotes (M8): issue photos & quote attachments

Invoices (M9): invoice/receipt PDFs

Reports (M7 pipeline): HTML/PDF stored here, delivered via signed links

Inbox (M10): message attachments reference FileObject or direct signed links

14) Risks & Mitigations

Broken links (expired signed URLs).
Mitigation: app refresh strategy; server provides bulk sign for galleries.

Large uploads on 2G.
Mitigation: resize on device where possible; allow delayed background uploads; keep XL/thumb for UI speed.

Security misconfig (public bucket).
Mitigation: enforce private buckets; sign all GETs; add automated checks in health job.

Storage growth.
Mitigation: lifecycle rules, thumbnails only for images, periodic orphan sweep (files with no valid ref).

15) Observability & Ops

Logs: presign, commit, process start/end, variant creation, errors.

Metrics: uploads/day, avg file size, processing TAT, variant hit ratio, orphan count.

Alerts: processing failures > threshold; antivirus hits; bucket permission drift.

16) Test Plan

Unit: content-type whitelist, size limits, path builder, variant naming.

Integration:

Presign → upload → commit → worker generates xl/thumb; signed GET works.

HEIC upload converts to JPEG (if enabled).

Unauthorized sign attempt for another org’s file → 403.

Expired presign fails; retry works.

RLS: client cannot sign files unrelated to them; carer cannot read other carers’ visit photos.

Resilience: simulate worker crash mid-process, ensure idempotent re-processing.

17) Deliverables

Prisma models + migrations: FileObject, FileAudit.

RLS SQL policies for file tables.

NestJS controllers/services: FilesController (presign, commit, sign, bulk sign, soft delete).

Worker: files.process (EXIF, rotate, variants, optional AV).

Nginx/MinIO config snippets; .env template; health check for bucket privileges.

UI components: uploaders, galleries, signed fetch helpers.

18) Acceptance Demo

Carer uploads three visit photos (weak network) → they queue, upload, commit; manager sees thumbs; client opens visit and views images via signed URLs.

Upload a PDF invoice; generate signed link; download works; link expires and refreshes when reopened.

Attempt cross-org access to sign a file → blocked.

HEIC phone image → stored original + generated xl and thumb; EXIF shows capture time; orientation correct.

Module 12 — Notifications (WhatsApp • SMS • Email • Push)
1) Objectives

Orchestrate timely, reliable notifications across WhatsApp, SMS (Deywuro), Email (SMTP), and Push (Expo).

Cover reminders, status updates, billing, and approvals with fallbacks, throttling, and quiet-hours.

Keep everything org-scoped, auditable, and template-driven (variables & locales).

2) Scope (in / out)

In

Unified Outbox with state machine + retries + delivery receipts

Triggers: T-24h / T-1h job reminders, On the way / On site / Done, quote sent/approved, invoice sent/paid/overdue

Channel fallbacks (e.g., WhatsApp → SMS → Email)

Quiet hours & per-client opt-in/opt-out, per-org rate limits

Message templates (per org) with variables, simple i18n (en, fr, local)

STOP/UNSUBSCRIBE handling for SMS/WhatsApp

Brand headers/footers & short links

Out (deferred)

Rich template designer with A/B testing

In-depth time-zone per client (we’ll use org TZ in v1)

Voice calls

3) Success Criteria

Reminders reach clients at T-24h and T-1h unless muted, with fallback if primary channel fails.

Status updates (en_route, on_site, completed) deliver < 5s after event.

Billing & approvals notifications drive the correct deep links and reflect delivery status in the timeline.

Compliance: STOP / UNSUB is honored instantly.

4) Interfaces (API contracts)
Scheduling / Fire-and-forget

POST /notify/queue
{
  "to": {"clientId":"...", "channel":"whatsapp|sms|email|push|auto"},
  "templateKey":"job_reminder_T24",
  "vars":{"client.firstName":"Ama","job.window":"9–12"},
  "link": {"type":"job","id":"job_123"},
  "options":{"fallback":true,"sendAfter":"2025-11-01T09:00:00Z"}
}

→ { outboxId }

Admin tools

GET /notify/outbox?status=pending|sent|failed&channel=&from=&to=&page=&limit=

GET /notify/outbox/:id → payload + attempts + provider meta

POST /notify/outbox/:id/cancel

POST /notify/test → send a test message to an admin’s number/email

Preferences

GET /clients/:id/notify-prefs

PATCH /clients/:id/notify-prefs
{ "primary":"whatsapp","fallbacks":["sms","email"],"quietHours":{"start":"21:00","end":"07:00"}, "optOut":{"sms":false,"whatsapp":false,"email":false,"push":false} }

Templates (per org)

GET /notify/templates

POST /notify/templates
{
  "key":"invoice_overdue",
  "channel":"sms|whatsapp|email|push|auto",
  "locale":"en",
  "subject":"[PoolCare] Invoice #{invoice.number} is overdue",   // email only
  "body":"Hi {client.firstName}, your invoice of {invoice.total} is overdue. Pay here: {invoice.link}",
  "variables":["client.firstName","invoice.total","invoice.link"]
}

PATCH /notify/templates/:id (versioned); GET /notify/templates/:key/versions

Webhooks (providers)

POST /webhooks/deywuro (SMS delivery & STOP)

POST /webhooks/whatsapp (delivery/read & STOP equivalents)

POST /webhooks/email (open/bounce if supported)

POST /webhooks/expo (device unregistered)

Provider webhooks update Outbox delivery status and Preferences (opt-out).

5) Data Model

NotifyTemplate
id, orgId, key, channel('sms'|'whatsapp'|'email'|'push'|'auto'), locale, subject?, body, version, isActive, createdAt, updatedAt

NotifyOutbox
id, orgId, toClientId?, toUserId?, channel, templateKey, locale, vars jsonb, linkType?, linkId?, status('pending'|'sending'|'sent'|'failed'|'canceled'), attempts int, maxAttempts int, nextAttemptAt, sentAt?, errorCode?, provider jsonb, createdAt, updatedAt

NotifyPreference
id, orgId, clientId, primaryChannel, fallbackChannels text[], optOut jsonb {"sms":false,...}, quietStart time, quietEnd time, lastUnsubAt?

ShortLink
id, orgId, targetType('job'|'visit'|'invoice'|'quote'|'report'), targetId, token, expiresAt, createdAt, clickedAt?

Indexes

NotifyOutbox(orgId, status, nextAttemptAt)

NotifyTemplate(orgId, key, locale, version)

NotifyPreference(clientId), ShortLink(token) unique

6) Security (RLS)

NotifyOutbox / NotifyTemplate / NotifyPreference / ShortLink

SELECT: ADMIN/MANAGER in org; CLIENT can see none (they just receive)

INSERT/UPDATE/DELETE: ADMIN/MANAGER only; webhooks update by server

Enforced via app.user_id, app.org_id, app.role. Webhook routes bypass auth but verify provider secrets.

7) Triggers & Business Rules

7.1 Time-based (cron worker)

T-24h Job reminder: daily at 09:00 local → schedule for next day jobs

T-1h Job reminder: hourly job → for jobs with windowStart in 60–75 min

Overdue invoice reminders: daily (D0, D+3, D+7 cadence)

Quote reminder: D+2 if status pending

7.2 Event-based (listeners)

Job en_route → “On the way” (ETA if available)

Job on_site → “We’re on site”

Visit completed → “Visit complete + report link”

Quote created/approved → send link/confirmation

Invoice sent/paid → send link/receipt

7.3 Fallback ladder

Determine primary from Preferences; if optOut[primary] true or delivery fails/timeout, try fallbacks in order within a 5–10 min window.

Don’t send duplicates across channels within the dedupe TTL (e.g., 30 min for same templateKey + target).

7.4 Quiet hours

If now within client quiet hours (or org default):

Queue with sendAfter = quietEnd, except critical: job en_route (always allowed).

Email is allowed during quiet hours (configurable).

7.5 Unsubscribe / STOP

SMS: incoming “STOP”, “UNSUBSCRIBE”, etc. → set optOut.sms=true, write audit, send confirmation.

WhatsApp: mirror provider rules (e.g., block proactive if user blocked/unsubbed).

Email: include unsubscribe link → updates optOut.email=true.

7.6 Idempotency & dedupe

Outbox has (orgId, templateKey, target, hash(vars)) soft-unique for a dedupe TTL; retries reuse same row.

8) Rendering & Variables

Variables resolved server-side from linked objects:
{client.firstName}, {job.window}, {job.eta}, {invoice.total}, {invoice.link}, {quote.link}, {visit.report.link}, {org.name}, {org.support.phone}

Email supports subject + HTML; SMS/WhatsApp/Push use body (text).

Short links: generate a ShortLink token → embed; token maps to deep screen in apps.

9) Workers & Delivery

Queues: notify.schedule (cron), notify.send (per outbox), notify.retry (backoff)

Adapters:

WhatsApp: BSP/Cloud API send text/media; record messageId; map read/delivered webhooks

SMS (Deywuro): send; capture messageId; delivery callback updates status

Email (SMTP): send via org SMTP; basic bounce handling

Push (Expo): batch sends; remove invalid tokens on 410

Backoff: 1m, 5m, 15m; maxAttempts default 5

Timeouts: treat no-receipt after 10m as soft fail and consider fallback

10) UX Contracts

Manager Console

Notifications tab: Outbox table (status, channel, template, target, attempts, last error), filters, quick resend/cancel

Template manager: list, create/clone, version history; test send

Client profile: Preferences card (primary, fallbacks, quiet hours, opt-outs)

Toggle per-event switches at org level (e.g., enable T-1h reminders)

Client App

No direct settings v1; unsubscribe via channel; a minimal “Notification settings” page can land in Phase 2.

11) Dependencies & Config

Relies on M1 (Auth), M6–M10 (events & links), M11 (short-lived signed URLs in messages).

ENV:
ORG_TZ=Africa/Accra
NOTIFY_MAX_ATTEMPTS=5
NOTIFY_DEDUPE_MINUTES=30
SMTP_HOST=... SMTP_USER=... SMTP_PASS=...
DEYWURO_API_KEY=...
WHATSAPP_BSP_TOKEN=...
EXPO_ACCESS_TOKEN=...
URL_BASE=https://app.poolcare.xxx


Branded templates pull org name/logo from Org settings (add fields).

12) Cross-Module Boundaries

Jobs/Visits (M6–M7): status events trigger immediate notifications

Issues/Quotes (M8): quote links & approvals

Invoices (M9): sent/paid/overdue flows

Inbox (M10): notifications also appear as messages in the relevant thread (optional echo)

Files (M11): reports/receipts links come from signed URLs

13) Risks & Mitigations

Spam/over-notify → client churn.
Mitigation: dedupe TTL, quiet hours, per-event toggles, fallback only when needed.

Provider outages.
Mitigation: multi-channel fallback, retries, alerting on error spikes.

Compliance (STOP).
Mitigation: immediate opt-out, audit, block future sends on that channel.

Broken links.
Mitigation: short-link service with token validity checks and graceful errors.

14) Observability & Ops

Logs: every state transition in Outbox; provider responses; webhook receipts

Metrics: send volume by channel, success %, median TTD (time-to-deliver), reminder coverage %, unsubscribe rate

Alerts: error rate > threshold per channel, webhook failures, backlog in notify.send

15) Test Plan

Unit: template variable resolution, quiet-hours gating, dedupe hashing

Integration:

Create job tomorrow → T-24h reminder queued → sent via primary (WhatsApp); simulate fail → fallback SMS succeeds

Job en_route → immediate push + WhatsApp within seconds

Invoice overdue D+3 → reminder; client replies STOP to SMS → further SMS suppressed, WhatsApp/email still allowed

Email unsubscribe link toggles optOut.email=true

RLS: cross-org reads blocked; only admins manage templates/outbox.

16) Deliverables

Prisma models + migrations: NotifyTemplate, NotifyOutbox, NotifyPreference, ShortLink

RLS SQL policies for all

Workers: notify.schedule, notify.send, notify.retry

Provider adapters (WhatsApp, Deywuro, SMTP, Expo) + webhook handlers

Manager UI: Outbox & Template manager + Client preferences card

Seed: baseline templates (en/“plain”), e.g., job_reminder_T24, job_reminder_T1, job_on_the_way, visit_complete, quote_sent, quote_approved, invoice_sent, invoice_paid, invoice_overdue

17) Acceptance Demo

Set client prefs to primary WhatsApp with SMS fallback, quiet hours 21:00–07:00.

Create a job for tomorrow → T-24h reminder queued and sent; outbox shows sent with provider id.

Change job to en_route → client receives On the way push + WhatsApp in seconds.

Send an overdue invoice reminder; client replies STOP via SMS; observe optOut.sms=true and further SMS suppressed.

Break WhatsApp adapter → create new reminder; system auto-falls back to SMS; outbox shows attempt-1 fail, attempt-2 sent.

Cross-org access to Outbox → denied by RLS.


Module 13 — AI Services (Dosing Coach • Report Writer • Quality Auditor • Smart Replies • Dispatch Assist)
1) Objectives

Add AI that saves real time for carers, managers, and clients—without being spooky or risky.

Keep AI outputs grounded in your data (readings, targets, items, windows, totals).

Run heavy tasks in workers with retries; expose explainability (why a dose/route/suggestion).

2) What’s in / out

In

Dosing Coach (chemicals & steps based on pool volume, readings, targets)

Report Writer (visit narrative + HTML; already triggered in M7; here we formalize inputs/outputs)

Quality Auditor (rules + AI anomaly text, score 0–100)

Inbox Smart Replies (2–3 grounded suggestions + quick snippets)

Dispatch Assist (natural-language “resequence today” or “fit this add-on job” guidance)

Out (deferred)

Full ML forecasting of chemical consumption (Phase 2)

Vision-based recognition of cloudy water/equipment models (Phase 2)

OR-Tools solver (in M6 P2)

3) Success Criteria

Dosing suggestions are numerically correct, cite formula, and fit org safety caps.

Report generation lands ≤ 2 minutes after visit completion.

Quality score flags missing required evidence, inconsistent data, and too-short visits.

Smart replies never hallucinate amounts/dates; they pull from live links.

Dispatch assist produces feasible sequences and explains trade-offs.

4) Service Interfaces (API contracts)
4.1 Dosing Coach

POST /ai/dosing/suggest

{
  "poolId":"...", "visitId":"...", 
  "volumeL": 45000,
  "targets": {"ph":[7.2,7.6],"chlorine_free":[1,3],"alkalinity":[80,120]},
  "readings": {"ph":7.8,"chlorine_free":0.2,"alkalinity":70},
  "inventory": {"liquid_chlorine":{"avail_ml":5000,"strength_pct":12.5}},
  "orgPolicy": {"maxDosePerVisit":{"liquid_chlorine_ml":3000,"acid_ml":2000}}
}

→
{
  "steps":[
    {"chemical":"liquid_chlorine","qty":1400,"unit":"ml","why":"raise FC from 0.2→2.0 ppm for 45,000 L @12.5%"},
    {"chemical":"muriatic_acid","qty":350,"unit":"ml","why":"lower pH from 7.8→7.5"}
  ],
  "estimates":{"fc_delta_ppm":1.8,"time_min":10},
  "warnings":["Close to max per-visit chlorine dose (1.4 L vs cap 3.0 L)"]
}

4.2 Report Writer

POST /ai/report/compose

{
  "visitId":"...",
  "client":{"name":"Ama"},
  "pool":{"name":"Main Pool","volumeL":45000,"surfaceType":"tile"},
  "template":{"name":"Weekly Basic","version":2},
  "readings_before":{"ph":7.8,"chlorine_free":0.2,"alkalinity":70},
  "chemicals":[{"chemical":"liquid_chlorine","qty":1400,"unit":"ml"}],
  "checklist":[{"id":"vacuum","done":true},{"id":"brush","done":true}],
  "photos":[{"url":"...thumb","label":"before"},{"url":"...thumb","label":"after"}],
  "notes":"Dog on site; used side gate",
  "targets":{"ph":[7.2,7.6],"chlorine_free":[1,3],"alkalinity":[80,120]}
}

→ { "html":"<report...>", "summary":"Balanced chlorine and pH; vacuumed, brushed." }

4.3 Quality Auditor

POST /ai/quality/score
{ "visitId":"..." }

→

{
  "score":86,
  "flags":[
    {"code":"REQUIRED_PHOTO_MISSING","severity":"high","hint":"1 after-photo missing"},
    {"code":"READING_OUT_OF_RANGE","severity":"med","hint":"FC below target; no shock recorded"}
  ],
  "explain":"Checklist complete; 2 photos ok; FC still low after 1.4L 12.5%—suggest recheck."
}

4.4 Inbox Smart Replies

POST /ai/inbox/suggest-replies (already stubbed in M10; here’s strict contract)

{ "threadId":"...", "contextLinks":["invoice:inv_123","job:job_456"] }

→

{ "intents":["reschedule"], "suggestions":[
    {"text":"Hi {client.firstName}, sure—we can move tomorrow’s window to 1–3 pm. Tap to confirm: {reschedule.link}","confidence":0.82},
    {"text":"We can also keep 9–12 and notify when the technician is 15 min away.","confidence":0.61}
] }

4.5 Dispatch Assist

POST /ai/dispatch/assist

{ "date":"2025-11-05","carerId":"...","ask":"Fit a 30-min add-on at East Legon after stop 3" }

→

{
  "plan":"Insert add-on after job J3 at 11:40; shift J4 by +18 min; still within its 12–14 window.",
  "delta":{"km":+2.1,"minutes":+24},
  "feasible":true,
  "applyPreview":{"sequence":[ "J1","J2","J3","ADDON","J4","J5" ]}
}

5) Data Model (additions)

AiRun

id, orgId, type('dosing'|'report'|'quality'|'inbox'|'dispatch'), status('queued'|'running'|'succeeded'|'failed'), input jsonb, output jsonb, error?, createdBy?, createdAt, completedAt

AiGuardrail

id, orgId, type, rule jsonb, createdAt (e.g., per-visit dose caps)

AiCache (optional)

orgId, key (hash of normalized input), value jsonb, ttlAt

Indexes:

AiRun(orgId, type, createdAt DESC)

AiCache(orgId, key) unique

6) Security (RLS)

AiRun / AiGuardrail / AiCache:

SELECT: ADMIN/MANAGER in org; CARER can read their own dosing/report/quality runs for visits/jobs they own; CLIENT no access.

INSERT: by server endpoints on behalf of authenticated user (must own the underlying entity).

UPDATE: server internal only.

7) Grounding & Guardrails

Grounding

Never generate from free text alone. Always fetch structured facts first (readings, targets, plan windows, invoice totals).

Compose the AI prompt with explicit fields + “do not invent” instruction.

If a value is missing, the AI should ask the API (return a “MISSING_FIELD” error) rather than guess.

Guardrails

Numerical checks: recompute dosing math server-side; reject if mismatch.

Per-visit caps: enforce from AiGuardrail/org policy.

Channel rules (Inbox): no payment amounts in text unless {invoice.total} is available; otherwise use a neutral phrasing with link only.

Dispatch: feasibility check via distance matrix & window constraints before offering “apply”.

8) Pipelines & Workers

Queues: ai.dosing, ai.report, ai.quality, ai.inbox, ai.dispatch (BullMQ).

Dosing:

Load pool volume, targets, recent readings/chemicals.

Model proposes doses + steps; server validates math & caps.

Persist AiRun, return steps; optionally auto-append to visit chemicals when user confirms.

Report:

Template (MD/HTML) with data bindings + short prose; render HTML; save via Files (M11).

Persist AiRun with summary; attach link back to Visit.

Quality:

Rule engine (deterministic) → base score; AI adds human-readable explanation + suggested follow-ups.

Persist & emit visit.quality.updated.

Inbox:

Fetch latest 10 messages + links; classify intent; propose 2–3 replies with placeholders only.

Persist run; UI shows chips; on click we render variables server-side and send.

Dispatch:

Parse request; build candidate insertion/sequence; run feasibility; compute deltas; return preview.

9) UX Contracts

Carer App

Dosing panel: shows exact math (“1.8 ppm FC ↑ requires 1.35 L @12.5% for 45,000 L”) and a “Apply to Chemicals” button.

Report: no UI—runs after complete; carer can open final report from Job history.

Quality: badge (score) visible to managers; carers see simple hints.

Manager Console

AI tab in Visit drawer: Dosing, Report status link, Quality flags.

Inbox: “Smart Reply” button with 2–3 options; one click inserts.

Dispatch: assistant panel in Jobs board → natural language ask → preview → Apply.

Client App

Sees final report; no AI labels. Sees helpful, concise messages (never raw prompts).

10) Dependencies & Config

Depends on M1, M3–M12 for data & links.

ENV (examples):
AI_PROVIDER=openai|vertex|local
AI_MODEL_DOSING=...
AI_MODEL_REPORT=...
AI_MODEL_INBOX=...
AI_MODEL_DISPATCH=...
AI_TIMEOUT_MS=15000
AI_CACHE_TTL_SEC=3600
DOSING_CAPS_JSON='{"liquid_chlorine_ml":3000,"acid_ml":2000}'

Use function-calling style prompts or strict JSON schemas; server validates output schema.

11) Risks & Mitigations

Hallucinations → ground on DB, schema-validate, and cross-check math.

Latency → cache common prompts (weekly report copy), prefetch facts, async workers with optimistic UI.

Over-dependence → always allow manual override; show formulas.

Compliance/privacy → never include PII beyond what’s necessary; redact phone/email in runs.

12) Observability & Ops

Logs: inputs (redacted), outputs (IDs & hashes), validation failures, fallbacks.

Metrics: run counts by type, median latency, error rate, acceptance rate (dosing applied / suggestions clicked), report TAT, quality score distribution.

Alerts: spike in validation failures, report backlog > N, AI latency > threshold.

13) Test Plan

Unit: dosing math verifier; schema validators; guardrail caps; feasibility checker.

Integration:

Visit with low FC → Dosing returns correct ml and passes cap; apply to chemicals; complete → Report written → Quality score calculated.

Inbox with reschedule ask → suggestions grounded with {reschedule.link}; no invented times.

Dispatch ask inserts add-on and stays within time windows.

RLS: AiRun visibility restricted to org; carers only for their visits; clients none.

Perf: 100 concurrent report jobs remain < 2 min p95 end-to-end.

14) Deliverables

Prisma models: AiRun, AiGuardrail, AiCache (optional).

NestJS services/controllers: Dosing, Report, Quality, Inbox AI, Dispatch Assist.

Workers for each queue; retry/backoff; dead-letter metrics.

Strict JSON schemas & validators per AI output; math checker for dosing.

UI hooks: Dosing panel (carer), AI chips (Inbox), Dispatch assistant pane, Quality flags in Visit drawer.

15) Acceptance Demo

Open a visit with FC=0.2 ppm and 45,000 L → Dosing Coach suggests 1.4 L 12.5% chlorine; apply → chemicals log updates.

Complete visit → within ≤2 min, Report Writer attaches HTML/PDF; Manager & Client can open it.

Quality Auditor returns score 86 with flag “FC still low”; Manager adds follow-up note.

Client WhatsApps “Can we move it to afternoon?” → Inbox Smart Replies propose a reschedule message with link; send in one click.

Ask Dispatch Assist to fit a 30-min add-on; preview remains feasible; apply reorders sequence with small delta.


Module 14 — Settings & Org Admin (Org Profile • Roles/Perms • Defaults • Tax • SLA • Integrations)
1) Objectives

Give admins one place to configure org-wide behavior: branding, timezone, taxes, notification defaults, SLA/quality rules, billing policies, and provider keys.

Centralize RBAC (roles & granular abilities) that gate every module.

Provide audit logging for sensitive changes and feature flags per org.

2) Scope (in / out)

In

Org Profile: name, logo, contact info, timezone, address, currency

Roles & Permissions: built-ins + custom roles; ability-to-endpoint mapping

Policies & Defaults: job windows, durations, dosing caps, invoice terms, reminder toggles

Tax & Finance: tax rates, invoice numbering, currency formatting

SLA/Quality: arrival windows, breach thresholds, quality scoring weights

Templates: visit templates (link), notification templates, invoice/receipt templates (header/footer)

Integrations: Paystack, Deywuro (SMS), WhatsApp BSP/Cloud, SMTP, Expo push, Maps (Google)

API Keys: first-party API tokens for external integrations; IP allowlist

Audit Log: who changed what/when (diff)

Feature Flags: enable/disable modules per org (e.g., Quotes, Subscriptions P2)

Out (deferred)

Multi-brand/child-org hierarchy

Full theme builder (beyond logos/colors)

SSO (Google/Microsoft) — future

3) Success Criteria

New org can be fully operational after filling Settings (providers validated).

Role changes apply immediately across API & UI (guards respect new abilities).

Edits to policies/versioned templates preserve history and are audited.

Missing/invalid provider configs surface clear errors; related features gracefully degrade.

4) Interfaces (API contracts)
Org Profile

GET /settings/org → { name, logoUrl, timezone, address, currency, support: {email, phone}, locale }

PATCH /settings/org → partial update (ADMIN only)

POST /settings/org/logo/presign → via Files (M11), then commit and PATCH logoUrl

Roles & Permissions

GET /settings/roles → list roles + abilities

POST /settings/roles → { name, description?, abilities: string[] }

PATCH /settings/roles/:id → update abilities

DELETE /settings/roles/:id → only if no members

GET /settings/abilities → canonical list from codegen (read-only)

Member assignment happens via Module 1 (/orgs/members), but uses these role ids

Policies & Defaults

GET /settings/policies

PATCH /settings/policies
{
  "jobs": { "defaultWindow": {"start":"09:00","end":"17:00"}, "allowCrossDayReschedule": true },
  "visits": { "defaultDurationMin": 45, "requirePhotos": true },
  "dosingCaps": { "liquid_chlorine_ml": 3000, "acid_ml": 2000 },
  "billing": { "invoiceDueDays": 7, "autoCreateOnVisit": true, "autoSendOnCreate": false },
  "notifications": { "t24": true, "t1": true, "onTheWay": true, "quiet": {"start":"21:00","end":"07:00"} },
  "sla": { "arrivalToleranceMin": 0, "breachAfterWindow": true },
  "quality": { "weights": { "requiredPhotos": 0.3, "checklist": 0.3, "readings": 0.4 } }
}

Tax & Finance

GET /settings/tax

PATCH /settings/tax
{
  "defaultTaxPct": 0,
  "taxName": "VAT",
  "invoiceNumbering": { "prefix":"PC-", "next": 1001, "width": 5 } ,
  "currency":"GHS",
  "showTaxOnItems": false
}

Templates (pointers)

GET /settings/templates → references to Visit, Notification, Invoice templates

PATCH /settings/templates → set defaults: { visitDefaultId, repairTemplateId, invoiceTemplateId }

Integrations

GET /settings/integrations (masked values)

PATCH /settings/integrations/test → { provider:'paystack'|'sms'|'whatsapp'|'smtp'|'expo'|'maps' } → { ok, error? }

PATCH /settings/integrations
{
  "paystack": {"secret":"***","public":"***"},
  "sms": {"provider":"deywuro","apiKey":"***","senderId":"POOLCARE"},
  "whatsapp": {"type":"cloud","token":"***","phoneNumberId":"***"},
  "smtp": {"host":"smtp.hostinger.com","port":587,"user":"support@","pass":"***","tls":true},
  "expo": {"token":"***"},
  "maps": {"googleApiKey":"***"}
}

API Keys (first-party)

GET /settings/api-keys

POST /settings/api-keys → { name, scopes:['read:jobs','write:invoices'], ipAllowlist?:['1.2.3.4/32'] }

DELETE /settings/api-keys/:id

Rotate: POST /settings/api-keys/:id/rotate

Audit & Flags

GET /settings/audit?actor=&entity=&from=&to=&page=&limit=

GET /settings/flags

PATCH /settings/flags → { quotes:true, inventory:false, subscriptions:false }

5) Data Model

OrgSetting (1 row per org; jsonb buckets for clarity + partial indexes)
orgId, profile jsonb, policies jsonb, tax jsonb, templates jsonb, integrations jsonb(masked at read), flags jsonb, createdAt, updatedAt

Role
id, orgId, name, description?, abilities text[], system bool default false, createdAt, updatedAt

Built-ins (system=true): ADMIN, MANAGER, CARER, CLIENT. You can add custom (e.g., FINANCE).

ApiKey
id, orgId, name, tokenHash, scopes text[], ipAllowlist cidr[], lastUsedAt, createdAt, revokedAt?

AuditLog
id, orgId, actorUserId?, entityType('OrgSetting'|'Role'|'ApiKey'|'Template'|'Tax'), entityId?, action('create'|'update'|'delete'|'rotate'|'enable'|'disable'), diff jsonb, ip, ua, createdAt

Indexes

OrgSetting(orgId) unique

Role(orgId, name) unique

ApiKey(orgId, revokedAt) partial

AuditLog(orgId, createdAt DESC)

6) Security (RLS)

OrgSetting/Role/ApiKey/AuditLog

SELECT: ADMIN in org. MANAGER may read limited sections (profile, policies) but not secrets.

INSERT/UPDATE/DELETE: ADMIN only (except reading masked integration values).

API key auth path: tokens map to a service principal with limited scopes; still org-scoped.

Secret fields are encrypted at rest (pgcrypto or app-level AES-GCM) and masked on read ("****"), only writable via PATCH.

7) Permissions Model (Abilities)

Canonical abilities (string slugs) loaded from codegen map to route guards. Examples:

jobs.view, jobs.assign, jobs.optimize

visits.complete, visits.view_all

clients.view, clients.edit

invoices.create, payments.refund, finance.view

issues.create, quotes.approve

inbox.reply, notify.manage

settings.manage (super), roles.manage, integrations.manage, apikeys.manage

Role = named set of abilities. Membership (Module 1) attaches role per user per org.

8) Validation & Business Rules

Timezone: valid IANA (default Africa/Accra)

Currency: ISO 4217 (GHS default); format options controlled server-side

Invoice numbering: monotonic; cannot decrement next

Integrations:

On save, validate via lightweight ping (Paystack list bank or verify key; SMTP NOOP; WhatsApp phone number info; Deywuro balance)

Mask secrets on GET; allow rotate without revealing old secrets

Roles:

Cannot delete built-in roles; cannot remove settings.manage from last remaining ADMIN

Prevent removing own settings.manage in current session (self-lockout guard)

Policies versioning:

Keep policies.version int. PATCH writes new version and stores prior in AuditLog.diff.

9) UX Contracts

Manager Console → Settings (left nav)

Organization (branding, contact, timezone, locale & currency)

Roles & Permissions (list + ability matrix; create custom role)

Policies & Defaults (Jobs/Visits/Dosing/Billing/Notifications/SLA/Quality)

Taxes & Numbering (tax name/rate, invoice numbering prefix/sequence)

Templates (defaults; links to Modules 4/12/9 editors)

Integrations (cards per provider with status “Connected/Invalid”; Test buttons)

API Keys (list, scopes, last used; create/rotate/revoke)

Audit Log (filterable table, diff viewer)

Feature Flags (toggles with tooltips; warnings on dependencies)

Client/Carer Apps

No direct access to Settings. (A future lightweight profile page for notification prefs is handled in M12.)

10) Dependencies & Config

Relies on Module 1 (Auth/Roles baseline). Surfaces defaults referenced by M5–M13.

Server guard middleware must check abilities on each protected route.

ENV (server): encryption key for secrets, plus provider defaults as fallbacks.

11) Cross-Module Boundaries

Jobs/Visits use default windows/durations and SLA from Policies.

AI Dosing (M13) reads dosing caps from Policies.

Notifications (M12) reads templates and quiet hours; Integrations define delivery capabilities.

Invoices (M9) reads tax defaults, numbering, currency.

Inbox (M10) may read org brand/short links domain.

12) Risks & Mitigations

Leaking secrets via logs/exports → mask at source; redact in logs; encrypt at rest.

Admin lockout by removing abilities → hard guard prevents removing last admin’s critical abilities.

Misconfig providers → “Connected/Invalid” status; disable dependent features and show in-context warnings.

Breaking changes to policies mid-operation → version and apply forward-only; show “effective since” banners.

13) Observability & Ops

Logs: settings changes (summaries), integration test pings (no secrets), role edits.

Metrics: # orgs configured, provider connectivity rate, failed sends due to invalid configs, policy version churn.

Alerts: missing/invalid provider keys causing repeated failures; 0 admins remaining (impossible state).

14) Test Plan

Unit: validator for timezone/currency; ability matrix enforcement; masking/encryption of secrets.

Integration:

Save Paystack keys → test passes → invoice payment flow works.

Change invoice numbering → next invoice uses new sequence.

Change policies (dosing caps) → Dosing Coach rejects over-cap.

Create custom role with minimal abilities → user cannot access restricted endpoints.

Audit log records diffs for policies/roles/integrations.

RLS: only org admins can read/write; managers read non-sensitive profile/policies if allowed.

Negative: attempt to delete last ADMIN or remove settings.manage → blocked.

15) Deliverables

Prisma migrations: OrgSetting, Role, ApiKey, AuditLog

RLS SQL for all Settings tables (admin-only read/write; masked reads)

Ability guard middleware + codegen map (route → ability)

Controllers/Services: Org, Roles, Policies, Tax, Templates, Integrations, ApiKeys, Audit, Flags

UI: Full Settings area with validation, masked inputs, test buttons

Seed: sensible defaults (Accra TZ, GHS, 7-day terms, dosing caps, base templates)

16) Acceptance Demo

Create a new org → fill Integrations (Paystack/SMS/WhatsApp/SMTP) → click Test → all show Connected.

Update Policies (default visit 45 → 60 min) → new jobs use 60; Audit Log shows diff.

Configure Tax and numbering (PC-00010) → next invoice is PC-00010.

Create custom role “Finance” with abilities finance.view, invoices.create → assign to user → verify access limited.

Rotate an API key; previous token immediately invalid; lastUsedAt updates for the new one on first call.

Attempt to remove the only admin’s settings.manage → blocked with clear error.

Module 15 — Web & Client Portal (Public Site • Client Login • Self-Serve)
1) Objectives

Give PoolCare a public web presence (lead capture + service request) and a Client Portal where customers can view visits/reports, approve quotes, and pay invoices.

Make onboarding self-serve (create client + pool + plan request) with AI-assisted form help.

Keep everything org-branded, secure, and tied into existing modules (M1–M14).

2) Scope (in / out)

In

Public pages: Home, Services, Contact, Request Service (lead form/wizard)

Client auth: Magic link (email) + OTP via WhatsApp/SMS (from M12), device remember

Client Portal: Dashboard, Visits/Reports, Quotes (approve/reject), Invoices (Paystack pay), Pools, Notifications settings

Self-serve onboarding wizard (optional): Client → Address/Pool → Preferred schedule → Submit

Custom branding: logo/colors; SEO basics; cookie banner

Custom domain for portal (e.g., portal.poolcare.africa), per-org theme

Out (deferred)

Full CMS/blog

Multi-property client roles with fine-grained ACL (Phase 2)

Subscription/autopay (ties to M9 Phase 2)

3) Success Criteria

New lead can request service in < 2 minutes; record appears in CRM (M2/M3) as prospect.

Existing client logs in with OTP/magic link and can download reports, approve quotes, pay invoices, and update notification prefs.

All portal data is org-scoped; no cross-tenant leakage; links are signed/short-linked.

4) Interfaces (API contracts)
Public (no auth)

POST /public/leads
{ "name":"Ama", "email":"ama@...", "phone":"+233...", "address":"East Legon", "service":"weekly|repair|oneoff", "notes":"" }

→ creates Lead + Thread (M10), notifies managers (M12).

POST /public/onboarding (wizard submit)

{
  "client": { "name":"Ama", "email":"...", "phone":"+233..." },
  "pool": { "address":"East Legon, Accra", "lat":5.63,"lng":-0.17, "volumeL":45000, "surfaceType":"tile" },
  "preference": { "frequency":"weekly","dow":"tue","window":{"start":"09:00","end":"12:00"} }
}


→ creates Client (prospect) + Pool (draft) + ServicePlan (draft) for review.

Auth (client)

POST /auth/client/start → { email? , phone? } → sends magic link or OTP (via M12 Outbox)

POST /auth/client/verify → { otp? , token? } → returns client JWT (role=CLIENT)

POST /auth/client/logout

Portal (CLIENT)

Dashboard: GET /portal/summary → counts + next visit, outstanding balance

Visits/Reports:

GET /portal/visits?from&to&page&limit

GET /portal/visits/:id → readings, photos (signed URLs M11), report link

Quotes:

GET /portal/quotes?status=pending|approved|rejected&page&limit

POST /portal/quotes/:id/approve / reject { reason? }

Invoices/Payments:

GET /portal/invoices?status=&page&limit

GET /portal/invoices/:id

POST /portal/invoices/:id/pay → Paystack init (M9)

GET /portal/payments?from&to

Pools:

GET /portal/pools

GET /portal/pools/:id → equipment/targets/attachments

PATCH /portal/pools/:id (limited: nickname, access notes)

Notify Prefs (M12):

GET /portal/notify-prefs

PATCH /portal/notify-prefs (primary + fallbacks, quiet hours, opt-outs)

Links

Short links (M12) routed to portal deep pages: /r/:token → resolves to quote/invoice/report with auth fallback (signed-link grace).

5) Data Model (additions)

Lead
id, orgId, name, email?, phone?, address?, service text, notes?, status('new'|'contacted'|'converted'|'lost'), source('web'|'referral'|'ad'), createdAt, updatedAt

OnboardingDraft
id, orgId, clientDraft jsonb, poolDraft jsonb, pref jsonb, createdAt, reviewedBy?, reviewedAt?, status('draft'|'approved'|'rejected')

ClientSession (optional audit)
id, orgId, clientUserId, deviceId, lastLoginAt, createdAt

Indexes:

Lead(orgId, status, createdAt DESC)

OnboardingDraft(orgId, status, createdAt DESC)

6) Security (RLS)

Lead / OnboardingDraft: SELECT/INSERT by ADMIN/MANAGER; public endpoints insert server-side without RLS; review/approve by managers only.

Portal: All existing tables reuse CLIENT policies (from earlier modules).

Short links: token resolves to target; if not authenticated, show minimal object then require login for full data (no PII leak).

7) Validation & Business Rules

Lead requires at least one of email/phone; normalize phone E.164.

Onboarding draft may estimate volume from dimensions (optional helper); mark as draft.

Approval of onboarding draft:

Creates/updates Client, Pool, and ServicePlan (paused or active).

Triggers welcome thread (M10) + “Next steps” notification (M12).

Quotes/Invoices access must belong to client; otherwise 404 (not 403) to avoid leakage.

Payment flow uses M9; after webhook, portal auto-refreshes invoice status.

Signed URLs (M11) only generated server-side after policy checks.

8) UX Contracts

Public Site

Fast, simple theme, brandable header/footer; CTA buttons to Request Service.

Request Service form → Success page (thank you + expected response time).

Optional Onboarding Wizard (3 steps): Contact → Pool → Preferences.

Client Portal

Dashboard: Next visit window, last visit summary (with report link), outstanding invoices, pending quotes.

Visits: list + detail (readings, photos gallery with signed URLs, downloadable report).

Quotes: approve/reject with single tap + confirmation; show items and totals.

Invoices: pay via Paystack; show receipts + statement download.

Pools: view details, attachments, access notes; request update.

Settings: notification preferences (primary/fallback/quiet hours), update contact details (change triggers verification).

Mobile-first responsive; dark mode optional.

9) Dependencies & Config

Depends on M1–M14 (auth, users, pools, visits, quotes, invoices, files, notifications, settings).

Domain & hosting: Hostinger VPS (Nginx reverse proxy).

Env: portal base URL, email/SMS/WhatsApp templates for magic link/OTP, reCAPTCHA key (optional).

10) Cross-Module Boundaries

Inbox (M10): new leads create a thread; portal actions (approve/pay) echo to thread.

Invoices (M9): payments made in portal; receipts/statement downloads via Files (M11).

Notifications (M12): magic link/OTP; post-action confirmations.

Settings (M14): branding/logo, currency, invoice terms; portal theme reads org profile.

11) Risks & Mitigations

Anonymous data leakage via shared links.
Mitigation: Short links expire; show minimal info; require login for full view.

Brute-force on OTP.
Mitigation: rate limit per phone/email/IP; lockout after N attempts; CAPTCHA on repeat.

Contact mismatch on onboarding.
Mitigation: dedupe by normalized phone/email; prompt “Is this you?” if existing client.

SEO spam on public forms.
Mitigation: hCaptcha/reCAPTCHA + server-side validation.

12) Observability & Ops

Logs: lead submissions, OTP requests/verifications, portal sign-ins, quote approvals, invoice payments.

Metrics: site→lead conversion %, portal DAU/MAU, quote approval rate, online collection rate, avg time to pay after send.

Alerts: OTP abuse (rate spikes), high failed logins, payment init errors, signed-URL failures.

13) Test Plan

Unit: contact normalization; OTP token issuance/verification; short-link resolver.

Integration:

Submit Lead → appears in Leads list; Inbox thread created; manager notified.

Onboarding wizard → draft created → manager approves → Client/Pool/Plan created.

Client login via magic link and OTP; sees portal dashboard.

Open visit → report loads via signed URL; open quote → approve → follow-up job created (M8).

Open invoice → Paystack payment → webhook marks paid → receipt available.

RLS: try accessing another client’s visit/invoice → 404; cross-org blocked.

Perf: portal pages p95 < 1.5s TTFB on VPS; images use thumb/xl variants.

14) Deliverables

Backend: Controllers for PublicLead, Onboarding, ClientAuth, Portal (visits/quotes/invoices/pools/prefs); short-link resolver.

DB: Lead, OnboardingDraft tables + RLS; minor hooks to Client/Pool creation.

Frontend (Next.js or your stack on Hostinger VPS):

Public site: Home/Services/Request Service.

Portal: Dashboard, Visits, Quotes, Invoices, Pools, Settings.

Shared components: Auth modals (OTP/magic), FileGallery (signed URLs), Paystack button.

Nginx: routes /public/*, /portal/*, /r/:token; HTTPS with Let’s Encrypt.

Email/SMS/WhatsApp templates for OTP/magic link + transactional messages.

Basic SEO: meta, sitemap.xml, robots.txt; OpenGraph images.

15) Acceptance Demo

Submit a Request Service lead from the public site → lead appears; manager gets a notification; thread opens in Inbox.

Run the Onboarding wizard → draft shows up; manager approves → Client + Pool + (paused) Plan created; welcome message sent.

Client logs in with OTP → sees Dashboard; opens last visit and downloads the report.

Client approves a quote → system creates a follow-up job; thread shows approval.

Client pays an invoice via Paystack → webhook flips to paid; receipt downloadable.

Verify RLS by attempting to open another client’s invoice → 404; signed URLs work and expire as expected.

Module 16 — Analytics & Insights (KPIs • Dashboards • Exports • Cohorts)
1) Objectives

Give PoolCare operational, financial, and quality visibility at a glance.

Provide self-serve filtering/export, plus a stable analytics schema that reports can rely on.

Keep analytics org-scoped, efficient on Postgres (Hostinger VPS), and friendly to future BI tools.

2) Scope (in / out)

In

Manager dashboards (Today, Ops, Finance, Quality, Growth)

KPI definitions + SQL views/materialized views

Saved reports & CSV export

Cohorts (client activation/retention, quote→job conversion)

SLA & route efficiency metrics (from Jobs/Dispatch)

Revenue, AR, DSO, collections (from Invoices/Payments)

Quality scores & exceptions (from Visits/AI Quality)

Notifications performance (send/deliver/engage)

Out (deferred)

Predictive forecasting & anomaly detection (Phase 2)

Embedded 3rd-party BI (Metabase/Superset) — we’ll keep compatible

3) Success Criteria

Dashboards load < 2s p95 for typical org sizes.

Exports complete in < 30s and respect RLS.

KPIs match finance totals and job counts within 0.5% (reconciled).

Managers can save filters as Saved Reports and re-run later.

4) KPI Catalogue (baseline)

Ops

Jobs scheduled / completed / failed (by day, by carer)

On-time arrival % (arrived ≤ window end)

Average visit duration vs planned

Route km per day & km/visit; optimization savings (km, minutes)

Rework rate (% visits repeated within 7 days)

Quality

Avg Quality Score; flag rate by code (missing photos, out-of-range readings)

Template compliance (% required steps complete)

Photo counts per visit; report TAT (complete→report ready)

Finance

Revenue (recognized by paid invoices), Invoiced, Collected

AR balance & DSO (Days Sales Outstanding)

Collection rate by channel (Paystack vs cash/bank)

Average ticket value (visit vs repair), Quote approval rate & TAT

Credits & refunds issued

Growth

New leads, new clients, conversions (lead→client, issue→quote→job)

Churn (clients inactive > N weeks), Active clients

Average services per client (plans per client)

Notifications

Send → Delivered → Click (short-link) funnel

Unsubscribes by channel; reminder coverage %

5) Data Pipeline (Postgres-native)

Nightly rollups via scheduled jobs (e.g., BullMQ worker calling SQL functions).

Materialized views for heavy aggregates; incremental refresh windows (last 14/30/90 days).

Helper tables:

analytics_day_dim (calendar, week, month)

analytics_carer_dim, analytics_client_dim (denormalized names/segments)

All analytics tables include orgId and obey RLS (read-only by org roles).

6) Analytics Schema (read models)

Views / MatViews

an_job_daily → per day: scheduled, completed, failed, on_time%, km, minutes, optimization_savings

an_visit_quality_daily → score avg, flags counts

an_finance_daily → invoiced, paid, AR end balance, payments by method

an_quote_funnel_daily → issues, quotes, approvals, approval_rate, TAT

an_notifications_daily → sent, delivered, clicked, unsubscribes by channel

an_client_cohorts_monthly → cohort_month, clients, retained_m1/m3/m6

an_carer_perf_daily → jobs, on_time%, avg_duration_delta, quality_avg

Tables

saved_report → {id, orgId, name, type('ops'|'finance'|...), filters jsonb, schedule?}

export_job → background export metadata (status, path to file in Files M11)

(Each matview will have a small “windowed” version e.g., _last90 for fast dashboard loads.)

7) RLS & Permissions

Read-only dashboards available to ADMIN, MANAGER; optional FINANCE role sees Finance only.

Exports allowed for ADMIN and FINANCE (finance scope).

All queries filter by orgId = app.org_id; exports also re-check object-level rights when expanding detail.

8) Business Rules (how we compute)

On-time arrival: arrive_ts ≤ window_end (no grace) unless org policy sets tolerance.

Completion duration: completedAt - arrivedAt; planned = Job.durationMin.

Optimization savings: sum of OptimizationRun.suggestion.delta applied; show both km and minutes.

Revenue = sum of Payments (cash basis) within period; Invoiced = sum of invoice totals (accrual); AR = prior AR + invoiced − payments − credit notes.

DSO (rolling): AR / average_daily_sales * days_in_period.

Quote approval rate: approved / sent in period; TAT = approvedAt - createdAt.

Quality score = stored score; also compute % visits with flags.

Notification click: short-link clickedAt inside window.

9) Dashboards (UI)

A. Today (Command Center)

Tiles: Jobs today (total / unassigned / at risk), On-time %, En-route now, SLA breaches

Map: today’s jobs by status; toggle by carer

Table: “At risk” jobs (ETA > window), quick reassign

B. Operations

Charts: Jobs completed (7/30d), On-time % trend, Avg duration delta, Route km/day

Carer leaderboard: jobs, on-time %, quality avg, km/visit

Filters: date range, carer, client segment, tags

C. Quality

Quality score trend, flags by type, template compliance

Photo counts per visit, report TAT distribution

Drill: click a flag → open Visit drawer

D. Finance

Revenue vs Invoiced, AR & DSO trend

Payments by method, average ticket value, credits/refunds

Aging buckets: current, 1–30, 31–60, 61–90, 90+

Drill to invoices/payments

E. Growth / Funnel

Leads → Clients → Active plans

Issue → Quote → Approval → Follow-up job funnel

Churn & retention cohorts

Source breakdown (web/referral/ad)

F. Notifications

Send→Deliver→Click funnel by channel/template

Unsubscribe rate; reminder coverage %

All charts have Export CSV and Save as report.

10) Exports & Saved Reports

Any table or chart → Export CSV (background export_job + Files M11 link).

Saved Reports (per org): named filter presets; optional schedule (weekly email link to CSV/PDF snapshot).

PDF snapshot = server-side HTML render of the dashboard section (lightweight).

11) Performance Strategy

Use matviews for 90-day heavy joins; refresh concurrently (no lock) every 15 min for “fresh” dashboards; daily full refresh for >90d.

Critical cards (Today) query live tables with tight indexes and status predicates.

Partition large tables by month (Jobs, Invoices, Payments) if volumes grow.

12) Observability (for analytics system)

Logs: matview refresh start/end, durations, row counts, errors.

Metrics: dashboard TTFB, export queue time, refresh latency, cache hit rate.

Alerts: refresh failures, export failures, dashboard TTFB p95 > 2s.

13) Test Plan

Unit: KPI math (DSO, on-time, approval rate), AR rollforward, cohort bucketing.

Integration:

Seed jobs/visits/invoices/payments → dashboards match expected totals.

Change policy tolerance → on-time recalculates.

Approve quotes → funnel moves; Finance reflects draft→paid flows.

Notifications clicks flow into short-link metrics.

RLS: Finance views blocked for non-authorized roles; cross-org reads denied.

Perf: 50k jobs over 12 months → Ops dashboard p95 < 2s using matviews.

14) Deliverables

SQL migrations:

Dimensions (analytics_day_dim, analytics_client_dim, analytics_carer_dim)

Matviews + refresh functions: an_job_daily(_last90), an_visit_quality_daily(_last90), an_finance_daily(_last90), an_quote_funnel_daily(_last90), an_notifications_daily(_last90), an_client_cohorts_monthly

RLS on read models (org-scoped)

Workers:

analytics.refresh (15-min rolling, nightly full)

export.generate (CSV/PDF)

Backend:

GET /analytics/cards, GET /analytics/charts, POST /exports, GET /exports/:id

POST /saved-reports, GET /saved-reports, POST /saved-reports/:id/run

Frontend:

Dashboards A–F with filters, drill-downs, and export/save actions

15) Acceptance Demo

Load Today: see jobs, risk list, map; reassign one job and watch KPIs update.

Ops: filter last 30 days; carer leaderboard updates; export CSV for carer metrics (download link appears).

Quality: open flags chart → drill into a visit; report link accessible.

Finance: compare Invoiced vs Paid; AR & DSO trends visible; export Aging CSV.

Growth: run issue→quote→approval funnel; approval rate matches quotes list.

Create Saved Report “Monthly Finance (GHS)” and schedule weekly; verify emailed link to CSV/PDF.

Confirm RLS: non-finance role can’t open Finance dashboard; cross-org access denied.



Module 17 — Compliance & Audit (PII • Retention • Field Logs • Tamper-evident Trails • Backups)
1) Objectives

Protect client/carer data and make actions traceable, reviewable, and reversible where lawful.

Support DSR (data subject requests: access/export/delete), legal holds, and retention policies.

Provide tamper-evident audit trails across sensitive modules and disaster recovery procedures on your Hostinger VPS.

2) Scope (in / out)

In

PII catalog + tagging; field-level change logs for sensitive entities

Data retention & deletion policies (soft→hard delete workflows)

Data subject requests (Access/Export/Delete) with approval workflow

Legal Hold (freeze deletes/edits on selected subjects/records)

Tamper-evident audit chain (hash-linked ledger of critical events)

Backups, restores, and integrity checks (Postgres + Files)

Admin reports: who accessed PII, when, and why (justification notes)

Out (deferred)

Full DLP (content scanning across all files/messages) — Phase 2

eDiscovery search UI across message content — Phase 2

3) Success Criteria

Every sensitive change (e.g., invoice edit, quote total, job reschedule, visit readings) appears in an immutable audit chain with actor, timestamp, before/after.

DSR export produces a zip (JSON + PDFs/images references) within minutes.

Retention jobs automatically purge data past policy windows (after soft-delete grace).

Periodic backups succeed and are restorable; quarterly test restores pass.

4) Data Model (additions)

PiiTag (catalog of fields)

id, entity('Client'|'Pool'|'VisitEntry'|'Invoice'|'Quote'|'Thread'|'User'|...), field text, sensitivity('high'|'medium'|'low'), purpose text, createdAt

FieldLog (field-level change log)

id, orgId, entityType, entityId, field, oldValue jsonb?, newValue jsonb?, reason text?, actorUserId?, actorRole, ip, ua, occurredAt

AuditChain (tamper-evident ledger)

id, orgId, type('create'|'update'|'delete'|'access'|'export'|'login'|'role_change'|'payment'|'quote_approve'|...), subjectType, subjectId, payload jsonb, actorUserId?, ip, ua, createdAt, hash, prevHash

hash = SHA256(prevHash || stable_json(payload) || createdAt)

LegalHold

id, orgId, subjectType, subjectId, reason, placedByUserId, placedAt, releasedAt?

RetentionPolicy

id, orgId, entityType, keepDays int, softDeleteDays int, hardDeleteDays int, active bool

e.g., Thread keep 730 days; soft delete at 731; hard delete at 761.

DsrRequest

id, orgId, subjectType('client'|'user'), subjectId, type('access'|'export'|'erase'), status('open'|'approved'|'rejected'|'processing'|'done'|'failed'), reason text, requestedByUserId?, createdAt, closedAt?

DsrArtifact → {id, dsrId, type('json'|'pdf'|'csv'|'manifest'), fileId, createdAt}

BackupJob

id, orgId?, kind('db'|'files'), scope('full'|'incremental'), status, startedAt, finishedAt, artifactUrl?, checksum

Indexes

FieldLog(orgId, entityType, entityId, occurredAt)

AuditChain(orgId, createdAt DESC)

LegalHold(orgId, subjectType, subjectId, releasedAt)

RetentionPolicy(orgId, entityType, active)

DsrRequest(orgId, status, createdAt)

BackupJob(kind, startedAt DESC)

5) Security (RLS + abilities)

FieldLog, AuditChain: readable only by ADMIN (and specifically permitted auditors via custom role AUDIT).

LegalHold, RetentionPolicy, DsrRequest, BackupJob: ADMIN/AUDIT read; ADMIN write.

“Justification note” required before viewing high-sensitivity PII (e.g., client phone/email in bulk). Store as AuditChain(type='access').

All enforced with app.user_id, app.org_id, app.role + ability slugs: audit.view, audit.manage, retention.manage, dsr.manage.

6) What we log (FieldLog & AuditChain coverage)

Clients/Pools: contact edits, address/coords changes, target chemistry changes.

Jobs/Visits: reschedule window, assignment, readings & chemicals edits, completion/failed codes.

Quotes/Invoices/Payments: items/qty/price changes, status transitions, refunds, credit notes.

Settings (M14): policies, tax, roles/abilities, integrations (masked values).

Inbox (M10): message delete/undelete (if allowed), thread merges, link changes.

Auth: login success/fail, password changes (hash not logged), API key usage.

Each API endpoint adds:

X-Actor-Reason optional header → persisted to FieldLog.reason for sensitive actions.

7) Tamper-evident chain

For every FieldLog batch on a transaction, append one AuditChain event with:

Deterministic payload: {entity, id, operations:[{field, oldHash, newHash}], txnId, serverTs}

Link via prevHash (per-org head). Store the current head in OrgSetting.auditHead.

Verification job recalculates hashes nightly; alerts on mismatch (tamper suspicion).

8) Retention & Deletion

Policy types (per entity):

keepDays: data is fully accessible.

softDeleteDays: marks rows deletedAt and severs PII (masking) while keeping aggregates.

hardDeleteDays: physically remove rows, except items on LegalHold.

Soft delete behavior:

PII fields replaced with tokens: "REDACTED::<id>" while keeping non-PII metrics (e.g., visit duration, totals).

Hard delete:

Remove rows; create AuditChain(type='delete') with summary counts by entity.

Worker: retention.enforce runs nightly; respects LegalHold.

9) Legal Hold

Placing a hold on {subjectType: 'client', subjectId}:

Blocks soft/hard delete & editing of that subject and directly linked records (visits, quotes, invoices, threads).

UI badges “On Legal Hold”.

Release hold → retention resumes on next cycle.

10) Data Subject Requests (DSR)

Workflow:

Admin opens New DSR → choose subject (client/user) and type (access/export/erase).

System validates identity (email/phone match + confirmation message).

Status processing: spawn workers.

Access/Export: gather: Client, Pools, Jobs/Visits (readings, photos refs), Quotes/Invoices/Payments, Threads/messages (within retention), Notifications log. Produce:

manifest.json, client.json, visits.json, finance.json, threads.json

Signed links for files (images/reports) collected into a zip stored via Files (M11).

Erase: run soft delete immediately; schedule hard delete post-grace unless LegalHold present.

Status done; Client receives download link (short-link with expiry). Log AuditChain(type='export').

Erasure exemptions: finance records may need to be retained (statutory). We:

Mask PII on invoices/payments but keep amounts/dates for accounting.

Note exemptions in the DSR artifact.

11) Access governance

Just-in-time disclosure: viewing certain screens (bulk PII export, full messages search) prompts for Reason; we emit AuditChain(type='access').

Session watermarking (optional): UI watermark with user email/time when viewing PII exports.

12) Backups & Restore (Hostinger VPS + Postgres + MinIO/R2)

Database (Postgres):

Nightly pg_dump full + 15-min WAL archiving (if feasible). Retain 30 days.

Encrypt backups (age/PGP) and store off-box (e.g., Backblaze/S3/R2).

BackupJob(kind='db') rows record status + checksums.

Object storage (files):

Daily bucket sync (incremental) from MinIO to off-box storage.

Keep checksums; verify with periodic scrub job.

Restore drills:

Quarterly test: restore to isolated staging; run integrity checks (row counts, matviews refresh, app smoke tests). Record success in BackupJob.

RPO/RTO targets:

RPO ≤ 15 min (with WAL), RTO ≤ 4 hours for full stack.

13) Interfaces (API contracts)

Audit

GET /audit/events?from&to&type=&actor=&subjectType=&subjectId=&page&limit

GET /audit/fieldlogs?entityType&entityId&from&to

POST /audit/verify → runs hash verification (admin only)

POST /audit/justify → { reason, scope } (records access justification event)

Retention

GET /settings/retention / PATCH /settings/retention (manage RetentionPolicy[])

POST /retention/run (manual trigger)

Legal Holds

POST /legal-holds → { subjectType, subjectId, reason }

GET /legal-holds?subjectType&subjectId

POST /legal-holds/:id/release

DSR

POST /dsr → { subjectType, subjectId, type, reason }

GET /dsr?status=&subjectId=

GET /dsr/:id (status + artifacts)

POST /dsr/:id/approve / reject (optional internal workflow)

Backups

GET /backups?kind=&from=&to=

POST /backups/run → { kind:'db'|'files', scope:'full'|'incremental' }

POST /backups/verify (checksum verification)

POST /backups/restore/preview (dry run checks)

14) UX Contracts

Settings → Compliance

Tabs: Audit Trail, Field Changes, Retention, Legal Holds, Data Requests, Backups

Audit Trail: filterable table with hash verification badge (green/amber/red)

Field Changes: per-entity diff viewer (before/after, who/when/reason)

Retention: policy editor with preview (“if applied today, 1,204 visits soft-delete in 14 days”)

Legal Holds: list, place/release; context banner on affected records

Data Requests: wizard to create DSR; status list; artifact download; exemption note

Backups: job history, last success, download link (admin-only), test-restore checklist

On Records

Banners when LegalHold is active; “View Change History” link opens FieldLog for that record.

15) Business Rules & Guards

No destructive change without writing to FieldLog + AuditChain.

Erase respects exemptions; finance retains but masks PII.

LegalHold wins over retention/delete requests.

Hash chain: failing verification flips the audit banner to red and triggers alert.

Rate limiting DSR exports and bulk PII views to prevent abuse.

16) Observability & Alerts

Metrics: audit events/day, field changes/day, DSR SLA times, backup success %, restore drill frequency.

Alerts:

Audit verification failure

Backup failure or >48h since last good backup

DSR stuck processing > 24h

Retention job errors

Excessive PII access events from one user

17) Test Plan

Unit: hash chain builder/validator; retention date math; PII masking; legal hold gating.

Integration:

Edit invoice item → FieldLog row + AuditChain append; diff viewer shows before/after.

Place Legal Hold on client → erase/retention attempts blocked; UI shows banner.

Create DSR Export → artifact zip with JSON + signed links; download works; links expire.

Run retention with soft delete → PII masked; analytics still intact.

Simulate tamper (manually edit an AuditChain row) → nightly verify flags failure.

Backup run → artifact stored; test restore succeeds.

RLS: only ADMIN/AUDIT view audit/field logs; cross-org isolation.

18) Deliverables

Prisma models + migrations: PiiTag, FieldLog, AuditChain, LegalHold, RetentionPolicy, DsrRequest, DsrArtifact, BackupJob

RLS SQL + ability guards (audit.view, audit.manage, retention.manage, dsr.manage)

Middleware: field-change capture (before/after snap), justification header parsing

Workers: audit.verify, retention.enforce, dsr.export, dsr.erase, backup.run, backup.verify

UI: Settings → Compliance pages; record-level “Change History” drawer

Ops docs: backup/restore runbooks; DSR handling SOP; legal hold SOP


Module 18 — Inventory & Parts (Chemicals • Parts • Vans • Costing • Reorder)
1) Objectives

Track chemicals and repair parts across locations (warehouse, vans, on-site).

Make visit logs cost-aware (auto-price chemicals/parts consumed).

Prevent stock-outs with reorder points, suppliers, and simple purchase orders (POs v1).

Support lot/expiry for chemicals; weighted-average costing.

2) Scope (in / out)

In

Catalog: items (chemical/part), units, pack sizes, hazards

Locations: main warehouse, vans (per carer), “quarantine”

Stock: on-hand, available, reserved; lot/expiry for chemicals

Movements: receive, transfer, consume (visit), adjust, return

Costing: weighted-average per location; landed cost allocation on receipt

Reorder: min/max, recommended order qty; supplier pricing

Purchase Orders: draft → ordered → received → closed (no returns v1)

Links: auto-consume from Visit (M7); price to Invoice (M9) if configured

Out (deferred)

Serial numbers, advanced returns/RMA

Multi-currency procurement with FX

Full BOM/kitting

3) Success Criteria

Carer never starts day with zero stock for standard chems; Today shows van stock.

Recording chemicals in a visit decrements van stock and prices the invoice line (if enabled).

Manager sees low stock and can raise a PO in <2 minutes; receiving updates lots & costs.

All org-scoped & RLS-safe.

4) Interfaces (API contracts)
4.1 Catalog & Locations

GET /inventory/items?type=&query=&page=&limit=

POST /inventory/items
{ "sku":"LC-12", "name":"Liquid Chlorine 12.5%", "type":"chemical", "baseUnit":"ml",
  "packUnit":"L", "packSize":20, "hazmat":true, "taxPct":0, "sellPriceCents":1500 }

PATCH /inventory/items/:id

GET /inventory/locations // e.g., WH1, VAN-<carerId>, QUAR

POST /inventory/locations // admin only (add new depot/van)

GET /inventory/items/:id/stock?locationId=

4.2 Stock Movements

POST /inventory/movements

{ "type":"receive|transfer|consume|adjust|return",
  "itemId":"...", "fromLocationId?":"...", "toLocationId?":"...",
  "qty": 1400, "unit":"ml",
  "lot":{"code":"LC0925","expiry":"2026-09-01"} }

GET /inventory/movements?itemId=&from=&to=&locationId=&type=

Visit hook (server creates consume):

When Carer posts chemicals on /visits/:visitId/chemicals, backend converts units, creates consume from VAN-{carerId}, lots FIFO, and updates costing.

4.3 Reorder & PO

GET /inventory/reorder?locationId=WH1 → list low-stock items with recommended qty

POST /inventory/pos
{ "supplierId":"...", "currency":"GHS",
  "lines":[{"itemId":"LC-12","qty":100,"unit":"L","priceCents":1100}],
  "expectedAt":"2025-11-15" }

GET /inventory/pos?status=&supplierId=

PATCH /inventory/pos/:id (editable while draft|ordered)

POST /inventory/pos/:id/submit // draft→ordered

POST /inventory/pos/:id/receive
{ "receipts":[{"lineId":"...","qtyReceived":80,"lot":{"code":"LC1125","expiry":"2026-11-01"},"landedAllocCents":5000}],
  "toLocationId":"WH1" }

4.4 Suppliers

GET /inventory/suppliers

POST /inventory/suppliers

{ "name":"ChemCo Ghana","email":"procure@...","phone":"+233...","leadDays":7,
  "priceList":[{"itemId":"LC-12","unit":"L","priceCents":1100}] }

4.5 Reporting

GET /inventory/valuation?asOf= → per location, item on-hand, avg cost, total value

GET /inventory/usage?from=&to=&itemId=&carerId= → consumption per visit/carer

GET /inventory/expiry?withinDays=60 → lots nearing expiry

5) Data Model

InvItem
id, orgId, sku, name, type('chemical'|'part'), baseUnit('ml'|'g'|'ea'...), packUnit?, packSize numeric?, hazmat bool, taxPct numeric, sellPriceCents int?, isActive bool, createdAt, updatedAt

InvLocation
id, orgId, code('WH1'|'VAN-<uid>'|'QUAR'), name, type('warehouse'|'van'|'quarantine'), carerId?, isActive bool

InvStockLot (per location, lot/expiry aware)
id, orgId, itemId, locationId, lotCode?, expiryDate?, qtyOnHand numeric, avgCostCents int, createdAt, updatedAt

For parts with no lot, store a single row (lotCode null).

InvMove
id, orgId, type('receive'|'transfer'|'consume'|'adjust'|'return'), itemId, qty numeric, unit text, fromLocationId?, toLocationId?, lotCode?, expiryDate?, costCentsTotal int?, reason?, refType('visit'|'po'|'manual'), refId?, actorUserId?, occurredAt, createdAt

Supplier
id, orgId, name, email?, phone?, leadDays int?, address?, notes?

SupplierPrice
id, orgId, supplierId, itemId, unit text, priceCents int, updatedAt

PO
id, orgId, supplierId, status('draft'|'ordered'|'received'|'closed'|'canceled'), currency, expectedAt?, notes?, createdAt, updatedAt

POLine
id, orgId, poId, itemId, qty numeric, unit, priceCents int, qtyReceived numeric default 0

Indexes

InvStockLot(orgId, itemId, locationId)

InvMove(orgId, itemId, occurredAt DESC)

PO(orgId, supplierId, status)

Partial index InvStockLot(expiryDate) for expiry reports

6) Security (RLS)

InvItem/Location: SELECT org-wide; INSERT/UPDATE by ADMIN/MANAGER.

InvStockLot/InvMove:

SELECT: ADMIN/MANAGER; CARER may read their van lots/moves.

INSERT: server on behalf of user; consume allowed for assigned CARER’s van; receive/transfer/adjust managers only.

PO/Supplier: SELECT admins/managers; write admins/managers.

Enforce via app.user_id, app.org_id, app.role; guard van access by carerId.

7) Business Rules

7.1 Units & Conversions

Persist in baseUnit per item. Convert pack → base via packSize.

Reject mixed unit families (e.g., ml vs g) for same item.

7.2 Costing

Weighted-average per location: on receive, recompute avgCost for that lot/location:
new_avg = (old_qty*old_avg + received_qty*unit_cost) / (old_qty + received_qty)

Landed costs (shipping/duty) allocated proportionally across received lines (landedAllocCents).

7.3 Consumption

FIFO by lot expiry for chemicals; fallback by createdAt for parts.

If van stock insufficient:

Option A (strict): block completion until manager override.

Option B (lenient default): allow negative balance; create auto shortfall alert to reconcile.

7.4 Reorder

Item has minQty, maxQty per location (admin UI).

recommended = max(0, maxQty - available); consider open PO qty as available-incoming.

7.5 PO Receiving

Partial receives allowed; close PO when lines fully received.

Received lots to quarantine if hazmat check fails → manual move to WH1.

7.6 Expiry

Cannot consume expired lots; warn when consuming within 7 days of expiry (configurable).

7.7 Pricing to Invoice

If item has sellPriceCents and org toggled “bill chemicals/parts”, add/merge a line on the Invoice (M9) when visit completes:

Line label: item name + qty (human unit); tax from item.

8) UX Contracts

Manager Console → Inventory

Dashboard: Stock value, low-stock items, upcoming expiries, open POs.

Items: grid with type, unit, sell price, active toggle.

Locations: list + van stock view; transfer modal (WH→van).

Movements: filterable ledger; export CSV.

Reorder: table with recommended qty → “Create PO” prefilled.

POs: Kanban by status; PO detail with receive modal (scan lot code optional).

Carer App

Van Stock: today’s essentials with on-hand; quick sync before route start.

Add Chemical to Visit: shows on-hand; warns on low/negative; auto-logs consumption.

Client App

No inventory screens. Only sees billed chemicals/parts on invoice lines.

9) Dependencies & Integrations

M7 Visits (consume hook), M9 Invoices (bill lines), M13 Dosing (uses inventory for caps/hints), M16 Analytics (usage, cost/visit).

Optional barcode/QR scanning (Phase 2).

10) Analytics (ties to M16)

Ops: chemical ml/visit, parts per repair, consumption by carer.

Finance: cost/visit, margin on billed items, stock valuation trend.

Risk: expiry exposure, negative stock incidents.

11) Observability & Alerts

Logs: every movement (who/when/where), PO status changes, cost recomputes.

Metrics: stockouts avoided, % negative moves, days of cover for top items, on-time receiving.

Alerts: low stock, expiry < 30/60 days, negative balances, PO overdue.

12) Test Plan

Unit: unit conversions; weighted-average math; FIFO lot selection; reorder calc.

Integration:

Receive 100 L chlorine @ ₵11/L → avg cost = ₵11/L; transfer 20 L to VAN → on-hand updates.

Visit logs 1.4 L consumed → van lot decrements FIFO; invoice line added (if enabled).

PO partial receive with landed cost allocation; valuation reflects.

Block consuming expired lot; warning within 7 days.

Reorder list includes item below min; “Create PO” prefilled; receiving closes gap.

RLS: carer cannot view warehouse stock; manager can; cross-org blocked.

13) Deliverables

Prisma migrations: InvItem, InvLocation, InvStockLot, InvMove, Supplier, SupplierPrice, PO, POLine (+ item per-location min/max fields).

RLS SQL policies as above.

Services/Controllers: Items, Locations, Movements, Reorder, POs, Suppliers.

Visit hook: consumption + invoice line sync.

UI: Inventory area (dashboard, items, locations, movements, reorder, POs), Carer “Van Stock”.

Seeds: common chemicals with base units; default locations (WH1, QUAR); create VAN on carer creation.

14) Acceptance Demo

Seed items + WH1; transfer starter kits to VAN-A.

Carer completes a visit, logs 1.4 L chlorine → van stock decrements; invoice shows chemical line (if enabled).

Manager sees low stock warning; creates PO to ChemCo; receives with lot & expiry; avg cost updates; valuation reflects.

Try to consume an expired lot → blocked; adjust creates audit.

Analytics show cost/visit and usage by carer updated for the day.


Module 19 — Mobile & Offline Platform (Carer & Client Apps • Sync Engine • Background Tasks • Perf Budgets)
1) Objectives

Deliver rock-solid offline apps for Carers and Clients with fast startup, seamless data sync, and resilient media uploads.

Provide a single sync layer (delta, retry, conflict rules) used by both apps.

Keep data org-scoped, secure on device (encryption + biometrics), and battery-friendly.

2) Targets & Tech

Carer App: Android first (AAB), iOS later. React Native (Expo EAS) + SQLite (expo-sqlite) + JSI crypto.

Client App: React Native (Expo).

Background tasks: Expo Task Manager + Background Fetch; push via Expo.

Maps: Google Maps SDK; foreground service for short GPS pings during active visit (configurable).

3) Success Criteria

Carer can complete an entire day offline (5+ jobs, 20+ photos) and sync within 60s after reconnect.

Startup cold < 2.0s; Job Detail open < 300ms from local cache.

Media uploads never block completion; retries exponential up to 24h.

Zero data leaks across orgs; device theft exposure minimized (encrypted at rest; remote revoke).

4) Mobile Data Domains (Carer)

Cached locally (partial shapes):

Me: user profile, abilities, assigned van id.

Today: jobs windows, pools (address, gate/access notes), templates (resolved), checklists.

Visits: open/current (one active), recent (≤ 14d).

Inventory (light): van stock snapshot for display & validation.

Notifications: outbox echoes, last statuses (read-only).

Files: presign tokens, queued uploads, thumbnails.

(Client app caches a slimmer set: visits, reports, quotes, invoices, prefs.)

5) Local Storage Schema (SQLite)

Tables (prefix m_ for mobile):

m_kv(key TEXT PRIMARY KEY, value TEXT, updatedAt INT) — feature flags, last sync tokens.

m_user(id, orgId, name, role, abilities JSON, tokenExp INT)

m_job(id, orgId, poolId, windowStart, windowEnd, status, templateId, templateVersion, assignedTo, durationMin, lastLocalEdit INT)

m_pool(id, orgId, clientId, address, lat, lng, accessNotes, volumeL, targets JSON, lastLocalEdit INT)

m_visit(id, orgId, jobId, startedAt?, arrivedAt?, completedAt?, notes, rating, feedback, lastLocalEdit INT)

m_reading(id, orgId, visitId, ph, fc, ta, ch, cya, tempC, measuredAt, lastLocalEdit INT)

m_chemical(id, orgId, visitId, chemical, qty, unit, lotNo?, costCents?, lastLocalEdit INT)

m_photo(id, orgId, visitId, label, filePath, remoteUrl?, takenAt, exif JSON, uploadState('queued'|'uploading'|'done'|'failed'), retryCount INT, lastError?)

m_checklist(visitId, steps JSON, lastLocalEdit INT)

m_issue(id, orgId, visitId, type, severity, description, requiresQuote, lastLocalEdit INT)

m_queue(id PRIMARY KEY, method, path, body JSON, occurredAt INT, attempts INT, lastError?, dedupeKey?) — mutation queue

m_geo_trace(id, visitId, ts INT, lat, lng, accuracyM) — optional breadcrumb during active visit.

m_van_stock(itemId, qtyBase, updatedAt INT) — display only.

Indices on orgId, visitId, jobId, and (uploadState) for photos.

6) Sync Engine (both apps)

Transport

HTTPS with JWT; session vars set server-side.

Delta pull: GET /mobile/sync?since=ts&shapes=today,jobs,visits,issues,inventory

Push: queued mutations POSTed in order; idempotent server endpoints.

Flow

Bootstrap: after login → full pull of the “Today” shape and the last 14 days.

Foreground tick: every 60–120s (adaptive) → pull deltas if online.

Background tick: OS-permitted fetch (15m+ on iOS; 15m on Android) → small delta.

Realtime (optional): socket events can nudge a “fast pull”.

Conflict policy

Append-only entities (photos, readings, chemicals): merge.

Scalar fields (visit.notes, job.status): LWW by lastLocalEdit vs server updatedAt. If server newer, app shows conflict banner and keeps a local copy in m_conflicts.

Checklists: step-level merge (OR on done, concat notes with delimiter and author initial).

Idempotency

Each queued mutation has a dedupeKey (client-generated ULID). Server stores recent keys per user to drop duplicates safely.

Compression

JSON bodies compressed with gzip for pulls; images uploaded raw to storage (S3 POST/PUT).

7) Background Uploads (Files)

Photo capture → save to app sandbox → request presign → upload in background with OS task; on success call /files/commit.

Chunking not required v1 (15 MB cap), but retries with exponential backoff up to 24h.

Thumbnails generated on server (M11); on device show local thumbnail immediately.

8) Authentication, Security & Privacy

Secure storage: token + orgId in OS keystore (Expo SecureStore).

At-rest encryption for SQLite: use SQLCipher (Expo EAS plugin) or JSI encryption layer.

Biometric unlock (org toggle). Auto-lock after N minutes.

Remote revoke: backend can set mobileSession.revokedAt → app logs out on next pull.

Minimal PII cached; phone/email masked in local tables where not needed.

9) GPS & Route (Carer)

Optional GPS breadcrumb while status = on_site (not en_route) to reduce battery drain; 1 ping/2–5 min with accuracy gating.

“Today’s Route” screen uses locally cached jobs + map polyline; online enhances with traffic ETA when available.

10) Performance Budgets

Cold start: < 2.0s (Android mid-range).

Job detail open: < 300ms from local DB.

Pull delta response: < 200KB typical.

Memory ceiling: < 150MB active.

Battery: < 5%/hr while screen on during active use; < 1%/hr idle.

11) Error Handling & Resilience

Global banner for offline, with per-action to “queue anyway”.

Queue viewer (dev mode): see pending mutations; manual retry.

Fatal mismatch (HTTP 409 schema) → force full resync of affected shape only.

Media “stuck” detector: if upload > 15 min without progress → restart upload; after 5 fails → mark failed and allow re-pick.

12) Telemetry (privacy-safe)

Events: app start, login, sync pull duration/bytes, queue length, upload success/fail, screen TTI.

No PII; include orgId hash + device model/OS for support.

13) API Contracts (mobile-optimized)

Delta Pull

GET /mobile/sync

Query: since=<ms_epoch>, shapes=comma

Response:{
  "serverTs": 1735561234567,
  "jobs":[{...}],
  "pools":[{...}],
  "visits":[{...}],
  "readings":[...],
  "chemicals":[...],
  "issues":[...],
  "vanStock":[...],
  "tombstones":[{"type":"photo","id":"...","deletedAt":...}]
}

Mutations (idempotent with X-Idempotency-Key)

POST /jobs/:id/start|arrive|complete (M7 shape)

POST /visits/:id/readings

POST /visits/:id/chemicals

POST /visits/:id/photos/presign → upload → POST /visits/:id/photos/commit

POST /visits/:id/checklist

POST /visits/:id/issues

POST /inbox/threads/:id/messages (if enabled)

POST /auth/mobile/revoke (server) / POST /auth/mobile/ping (client heartbeat)

Light endpoints for Client app

GET /client/mobile/sync?since=...&shapes=visits,quotes,invoices,prefs

POST /clients/me/quotes/:id/approve

POST /invoices/:id/pay/paystack (webview handoff)

14) UX Contracts

Carer App

Today: list (window badges, distance ETA when online).

Job Detail: checklist, readings, chemicals (AI Dosing button), Photos (counter + status), Notes, Signature, Complete.

Route: map + stop order; “Start day” (sync + van stock check).

Sync badge: small dot (green synced / yellow pending / red failed).

Settings: biometrics toggle, data usage (Wi-Fi only uploads toggle), clear cached days.

Client App

Dashboard: next visit window, latest report link, outstanding invoices, pending quotes.

Visit detail: readings chart (local), photos gallery (signed URLs).

Billing: Paystack webview + status refresh.

Prefs: channel & quiet hours (M12).

15) QA Matrix & Test Plan

Unit: queue serializer; conflict resolver; time math for LWW; photo state machine.

Integration (device):

Airplane mode: complete visit with 3 photos → queue drains when back online.

Kill app during upload → resume & commit on reopen.

Server updates job while carer edits notes → LWW & conflict banner.

Biometric lock flow; remote revoke → logout.

Perf: seed 100 jobs/300 photos; cold start & Job Detail timings under budget.

Battery: 2-hour ride-along with one active visit every 30 min; verify budget.

Security: DB file encrypted; copying sandbox file unreadable off device.

16) Deliverables

RN packages: Sync SDK (TypeScript), Storage layer (SQLite + encryption), Queue Manager, Files uploader, Hooks (useToday, useVisit, useSync).

Screens: Today, Job Detail, Route, Settings (Carer). Dashboard, Visits, Quotes, Invoices, Settings (Client).

Native config: Android foreground service for on-site GPS pings; iOS background fetch.

Backend: /mobile/sync controller, delta builders, tombstones, idempotency cache, mobile session revoke.

DevOps: EAS build profiles, .env wiring, version gate (min app version header → force update modal).

Docs: offline SOP, conflict rules, troubleshooting tree.

17) Rollout Plan

Phase A (Internal): Carer app only, Android; 3 technicians; observe queue/latency.

Phase B: Add Client app (PWA or RN); enable quotes/invoices.

Phase C: iOS builds; push GPS breadcrumbs; tighten power usage after field feedback.

18) Acceptance Demo

Put device offline → start/arrive, add readings & chemicals, take 3 photos, capture signature, complete.

Go online → watch sync badge turn green; manager sees visit + report within ≤2 min.

Force a conflict (manager edits notes) → device shows conflict banner; local copy viewable.

Remote revoke session → device logs out on next sync.

Cold start time and Job Detail open meet performance budgets; battery drain stays within limits during a 1-hour mock route.

Module 20 — Deployments & DevOps (Hostinger VPS • CI/CD • Observability • Blue-Green)
1) Objectives

Ship PoolCare reliably on your Hostinger VPS with zero-downtime deploys.

Make environments reproducible (prod/stage/dev), secure, observable, and backed up.

One-click rollbacks, automatic DB migrations, and fast incident recovery.

2) Target Stack

Runtime: Node 20 (NestJS API), Next.js portal, React Native builds (EAS cloud), Redis (BullMQ), PostgreSQL.

Reverse proxy: Nginx (HTTP/2, gzip/br, rate-limit, TLS via Let’s Encrypt).

Process manager: PM2 (or Docker+Easypanel if you prefer).

CI/CD: GitHub Actions → SSH/rsync deploy (or Docker image push → Easypanel).

Obs: Uptime-Kuma (HTTP checks), Prometheus node_exporter, Grafana; logs via Loki or journald+Vector → S3/R2.

Secrets: .env per env (+ sops/age for repo-stored encrypted vars).

Backups: pg_dump + WAL (from M17), MinIO/R2 object backups.

If you prefer Easypanel, swap PM2 with containers; the rest stays the same.

3) Environments & Branch Strategy

main → production (auto deploy on tag v*.*.*)

develop → staging (auto deploy on push)

Feature branches → PR checks only (lint, typecheck, test)

Domains:

API: api.poolcare.africa

Portal: app.poolcare.africa

Admin/Manager: same Next.js app routes

CDN/Files (optional): files.poolcare.africa (proxy to MinIO/R2)

4) Server Layout (PM2 variant)
/srv/poolcare/
  api/            # NestJS
  web/            # Next.js
  workers/        # BullMQ workers
  shared/
    .env.prod
    .env.stage
    nginx/
    scripts/
  logs/

System users:

poolcare (app), postgres (db).
Firewall: allow 80/443/22; DB local only.

5) Nginx (TLS, gzip, rate-limits)

Let’s Encrypt via certbot (auto-renew).

HTTP→HTTPS 308 redirect.

Upstreams to API (localhost:4000), Web (localhost:3000).

Rate-limit auth/login & webhooks endpoints (e.g., 10 r/s burst 20).

Large client body limits for presigned upload callbacks (2–5 MB is fine; files go direct to MinIO/R2).

6) CI/CD (GitHub Actions)
6.1 Common Jobs

Node 20 setup, pnpm/yarn cache

Lint, Typecheck, Unit Tests

Build artifacts:

API: dist/ + package.json + lockfile

Web: .next/standalone + .next/static

6.2 Deploy (PM2 via SSH/rsync)

Rsync build to /srv/poolcare/<service>/releases/<gitsha>

Symlink current → new release

Run npm i --omit=dev in release (if not using standalone)

DB migrations (safe, idempotent)

Blue-green:

Start new PM2 app as api-v2 on :4001

Health-check /healthz

Nginx switch upstream to :4001

Stop old api-v1 after grace

Repeat for web (Next.js standalone) and workers

Example Action (API excerpt)
name: deploy-api
on:
  push:
    tags: ['v*.*.*']
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && npm run -w api build
      - name: Rsync to VPS
        uses: burnett01/rsync-deploy@v7
        with:
          switches: -avz --delete
          path: api/
          remote_path: /srv/poolcare/api/releases/${{ github.sha }}/
          remote_host: ${{ secrets.VPS_HOST }}
          remote_user: poolcare
          remote_key: ${{ secrets.VPS_SSH_KEY }}
      - name: Activate & reload
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: poolcare
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /srv/poolcare/shared/scripts && bash activate_api.sh ${{ github.sha }} prod

activate_api.sh (sketch)
#!/usr/bin/env bash
SHA=$1
ENV=$2
APP=api
BASE=/srv/poolcare/$APP
NEW=$BASE/releases/$SHA
ENVFILE=/srv/poolcare/shared/.env.$ENV

# Install deps (if needed)
cd $NEW && npm ci --omit=dev

# Migrate DB
cd $NEW && npx prisma migrate deploy

# Start parallel instance on :4001
pm2 startOrReload $NEW/pm2.config.cjs --only api-next --update-env -- \
  PORT=4001 ENV_FILE=$ENVFILE

# Health check
curl -fsS http://127.0.0.1:4001/healthz || { echo "unhealthy"; exit 1; }

# Swap Nginx upstream and reload
sudo ln -sf /srv/poolcare/shared/nginx/api-upstream.4001.conf /etc/nginx/conf.d/api-upstream.conf
sudo nginx -t && sudo systemctl reload nginx

# Stop old instance
pm2 delete api-current || true
pm2 start $NEW/pm2.config.cjs --only api-current --update-env -- \
  PORT=4000 ENV_FILE=$ENVFILE
pm2 delete api-next || true

If you use Easypanel/Docker, replace the above with: build/push image → easypanel deploy API, then set health checks and replicas=2 for rolling updates.

7) Configuration & Secrets

.env per env; never commit plaintext. Use sops (age) to keep encrypted copies in repo.

Critical vars: DB URL, REDIS URL, PAYSTACK, SMS/WhatsApp, SMTP, FILES (MinIO/R2), JWT keys, AI provider.

Runtime validation (zod): boot fails with clear error if missing.

8) Database & Migrations

Postgres tuned for 2–8GB RAM VPS (work_mem, shared_buffers).

Prisma (or your ORM) migrate deploy on each release.

Long migrations → pre-deploy maintenance window; run migrate diff for dry run.

Read replicas not necessary v1; plan for future if analytics load grows.

9) Workers & Scheduling

BullMQ queues: notify.*, files.process, ai.*, analytics.refresh, backup.run.

PM2 processes:

api-current (HTTP)

web-current (Next.js standalone)

worker-notify, worker-files, worker-ai, worker-analytics, worker-backup

Cron via workers (not system cron) to keep logs centralized.

10) Observability

Uptime-Kuma: checks for api/healthz, portal /readyz, webhook endpoints.

Grafana + node_exporter + postgres_exporter: CPU, RAM, disk I/O, DB connections, slow queries.

Logs:

JSON logs to stdout → Vector agent ships to Loki (or to file rotation).

Correlate requestId across API, workers, and Nginx.

Alerts (Grafana):

p95 latency > threshold, 5xx rate spike, queue backlog, low disk (<15%), SSL expiry <14 days.

11) Security & Hardening

OS updates automated (unattended-upgrades), fail2ban on SSH.

SSH keys only; no password login. Sudo only for a small admin group.

Nginx WAF (ModSecurity CRS optional), strict CORS, HSTS, content-security-policy for web.

DB only on localhost or private network; UFW blocks external DB access.

Secrets in env only; redact in logs; rotate quarterly.

Backups & restore drills from M17 wired into workers; quarterly restore to staging.

12) Zero-downtime Deploy & Rollback

Health endpoint: /healthz (dependencies up), /readyz (migrations done, queues connected).

Blue-green swap after /healthz passes; 30–60s drain for old connections.

Rollback: keep last 3 releases; symlink back + PM2 restart + Nginx reload. DB rollbacks only if migrations reversible; otherwise forward-fix.

13) Cost & Capacity Planning

Start: 2 vCPU / 4–8 GB RAM VPS; Postgres same box OK initially.

Separate DB box when concurrent users > 100 active or analytics grows.

Object storage: R2 (cheap egress to public); MinIO local for dev/stage.

14) Runbooks (SOP)

Deploy: tag release → Actions runs → Slack/Inbox message on success/fail.

Rollback: SSH, run shared/scripts/rollback.sh <release>.

Hotfix: patch branch → tag vX.Y.Z-hotfix.

Incident: check Uptime-Kuma → Grafana panels → logs (Loki query by requestId) → mitigate → postmortem template.

15) Acceptance Checklist

Push tag → Actions builds → VPS blue-green swap, no downtime.

New release runs migrations, passes health checks, queues consume.

Nginx serves TLS, HSTS, gzip/br; API CORS correct.

Uptime-Kuma green; Grafana shows CPU/RAM/DB; logs searchable in Loki.

Rollback to previous release in < 2 minutes.

Backups run nightly; restore drill to staging succeeds.

Rate-limit & WAF block brute-force; SSH hardened.

16) Deliverables

GitHub Actions workflows (deploy-api.yml, deploy-web.yml, checks.yml)

Nginx site configs + upstream switch snippets; certbot install script

PM2 configs for api/web/workers; blue-green helper scripts

Env templates (.env.example) + sops policy

Observability stack docker-compose (Grafana, Loki, Promtail/Vector, node_exporter, postgres_exporter) or native packages

Runbooks: deploy, rollback, incident, backup/restore


Perfect—adding an Addendum for Deywuro SMS + Live Location Check-in.

Addendum A — Deywuro SMS (Provider Adapter Spec)

Reference: Official “DEYWURO SMS API DOCUMENT.” Endpoint and parameters below come directly from the PDF. 
Deywuro

A1) Endpoint & Method

URL: https://deywuro.com/api/sms

Methods: POST or GET. 
Deywuro

A2) Required Params

username (provided by Deywuro)

password (provided by Deywuro)

destination (MSISDN, multiple allowed, comma-separated; e.g., 233244000000,233250000000)

source (Sender ID ≤ 11 chars, alphanumeric; e.g., Deywuro)

message (text) 
Deywuro

They explicitly allow multiple MSISDNs separated by commas. 
Deywuro

A3) Response Format & Codes

JSON: { "code": <number>, "message": "<description>" }

Codes:

0 = Successful

401 = Invalid Credential

403 = Insufficient balance

404 = Not routable

500 = Others

402 = Missing required fields 
Deywuro
+1

A4) PoolCare Integration (Module 12: Notifications)

Adapter name: deywuroSmsAdapter.

Config:
SMS_PROVIDER=deywuro
DEYWURO_USERNAME=...
DEYWURO_PASSWORD=...
DEYWURO_API_URL=https://deywuro.com/api/sms

Send contract (server):
POST /notify/providers/sms
{ to:"+23324...", text:"...", senderId:"POOLCARE" }

→ Adapter maps to:

POST https://deywuro.com/api/sms
username=...&password=...&source=POOLCARE&destination=23324...&message=...

Batching: For up to ~100 recipients per identical body, send as one call using comma-separated destination to save rate/latency. (If per-recipient personalization is needed, send individually.)

Retries/backoff: On code 500 or network error → retry 1m/5m/15m (maxAttempts=5). On 401|402|403|404 → no retry; mark Outbox failed with provider code (ties into M12 state machine).

Delivery receipts / STOP: The PDF doesn’t define DLR or STOP webhooks. We’ll:

Treat Deywuro as fire-and-forget (no DLR).

Handle STOP via our own inbound numbers/channels (WhatsApp or in-app) as defined in Module 12; when a client replies STOP to SMS routed to us, we toggle optOut.sms=true. (If Deywuro later exposes DLR/STOP hooks, we’ll wire /webhooks/deywuro as already reserved in M12.)

Example (NestJS service)
const form = new URLSearchParams({
  username: cfg.user,
  password: cfg.pass,
  source: senderId.slice(0, 11),
  destination: recipients.join(','),
  message: text
});
const res = await http.post(cfg.url, form, { headers: { 'Content-Type':'application/x-www-form-urlencoded' }});
/* Expect: { code: 0|401|403|404|402|500, message: string } */

Success condition: code === 0. Persist {provider:'deywuro', responseCode, responseMessage} on NotifyOutbox.

Example from provider doc (for GET/POST) is consistent with the above format. 
Deywuro

Addendum B — Carer Live Location Check-in (Arrival Autodetect)

We’ll augment Module 19 (Mobile & Offline) and Module 7 (Visits/Jobs) with geofenced arrival.

B1) Goals

Auto-check-in the carer as “Arrived” when within a small radius of the job’s coordinates.

Do it battery-friendly, offline-tolerant, and privacy-respecting.

B2) Mobile Behavior (Carer App)

When “Start Day” is tapped or a Job is opened, enable foreground location (high accuracy while active) and a light background fetch.

Arrival rule (local pre-check):

Within 75 m of job lat/lng (Haversine),

Accuracy ≤ 30 m, and

Dwell ≥ 60 s (two consecutive samples meet the radius+accuracy).

On meeting rule:

If online → call POST /jobs/:id/arrive with { lat, lng, accuracyM, occurredAt }.

If offline → queue the same mutation; timestamp with device time; show “Arrived (queued)”.

Battery guard: Only run high-accuracy while a job is en route or nearby; throttle to every 60–120 s when far.

B3) Server-Side Validation (API & Model)

Visit/Job table additions: arrivedAt, arrivedLat, arrivedLng, arrivedAccuracyM, arrivalMethod('manual'|'geo').

Endpoint: POST /jobs/:id/arrive
{ "lat":5.63, "lng":-0.17, "accuracyM":18, "occurredAt":"2025-11-05T10:20:30Z" }

Rules:

Check point within 100 m of job location (server radius slightly wider than client to allow GPS variance).

Reject if job not assigned to that carer or status not allowed (must be en_route or scheduled).

If valid, set arrivedAt=occurredAt, record coords & accuracy, set arrivalMethod='geo', emit job.on_site event (triggers M12 “We’re on site” notification if enabled).

RLS: Only assigned carer or managers can hit this endpoint; write guarded by abilities.

B4) Timeline & Analytics

Timeline automatically adds “Arrived (GPS)” entry.

Analytics (M16) uses arrivedAt for on-time KPI; accuracy is stored for debug but not exposed to clients.

B5) Privacy & Controls

Org toggle: “Enable live arrival detection.”

Scope: We do not stream continuous tracks; only sparse pings while a job is active and a single arrival fix saved.

Client visibility: Clients see only the status (“On site”), not raw coordinates.

B6) Edge Cases

Multi-pool properties: Pick nearest pool location for the job.

High-rise/malls (GPS drift): If accuracyM > 30, fall back to manual “Arrive” button.

Out-of-order sync: If queued arrive posts after complete, keep both and show a warning to manager; ops can adjust.

Addendum C — Client Mobile App (React Native) Decision

We will ship two mobile apps:

1) Carer App: React Native (Expo) as already defined in Module 19 (Android first, iOS later).
2) Client App: React Native (Expo). The previously mentioned “responsive web portal” is deferred. All “Portal” endpoints in Module 15 are consumed by the Client mobile app. A web portal may be revisited in a later phase.

Notes:

- Terminology: When Module 15 references “Portal,” read it as the Client mobile app consuming the same API contracts.
- UI/Flows: The mobile Client app will implement Visits/Reports, Quotes (approve/reject), Invoices (Paystack pay), Pools, and Notification preferences.
- Backend/API: No changes to routes are required; the RN app will use the existing `/portal/*` endpoints.