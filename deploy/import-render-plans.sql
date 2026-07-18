-- Import SubscriptionTemplate (the service plans) from the Render export.
--
--   psql -U poolcare -d poolcare -v ON_ERROR_STOP=1 -f import-render-plans.sql
--
-- Reads scratch_render over dblink, remaps orgId to the live PoolCare org.
-- visitTemplateId is null on all Render rows, so no VisitTemplate FK to satisfy.
-- Re-runnable: rows already present (by id) are skipped.

BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink;

\set live_org '''fa24d7ed-a7d9-44c8-9574-2eb6ea178367'''

CREATE TEMP TABLE r_plan AS
SELECT * FROM dblink('dbname=scratch_render user=poolcare', $q$
  SELECT id, name, description, frequency, "billingType", "pricingType",
         "priceCents", "priceMinCents", "priceMaxCents", currency, "taxPct",
         "discountPct", "serviceDurationMin", "visitTemplateId",
         "includesChemicals", "maxVisitsPerMonth", "trialDays", "isActive",
         "displayOrder", features, "createdAt", "updatedAt"
  FROM "SubscriptionTemplate"
$q$) AS t(id uuid, name text, description text, frequency text, billing_type text,
          pricing_type text, price_cents int, price_min_cents int,
          price_max_cents int, currency text, tax_pct numeric, discount_pct numeric,
          service_duration_min int, visit_template_id uuid, includes_chemicals boolean,
          max_visits_per_month int, trial_days int, is_active boolean,
          display_order int, features jsonb, created_at timestamptz,
          updated_at timestamptz);

INSERT INTO "SubscriptionTemplate" (
  id, "orgId", name, description, frequency, "billingType", "pricingType",
  "priceCents", "priceMinCents", "priceMaxCents", currency, "taxPct", "discountPct",
  "serviceDurationMin", "visitTemplateId", "includesChemicals", "maxVisitsPerMonth",
  "trialDays", "isActive", "displayOrder", features, "createdAt", "updatedAt")
SELECT id, :live_org::uuid, name, description, frequency, billing_type, pricing_type,
       price_cents, price_min_cents, price_max_cents, currency, tax_pct, discount_pct,
       service_duration_min,
       -- only keep the template link if that template actually exists here
       (SELECT v.id FROM "VisitTemplate" v WHERE v.id = r_plan.visit_template_id),
       includes_chemicals, max_visits_per_month, trial_days, is_active,
       display_order, features, created_at, updated_at
FROM r_plan
WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionTemplate" s WHERE s.id = r_plan.id);

\echo '--- plans now live ---'
SELECT name, "priceCents"/100.0 AS price, currency, frequency, "isActive"
FROM "SubscriptionTemplate" ORDER BY "priceCents";

COMMIT;
