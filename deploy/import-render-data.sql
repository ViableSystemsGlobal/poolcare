-- Import Client / Pool / Carer from the Render export into a poolcare database.
--
--   psql -U poolcare -d <target> -v ON_ERROR_STOP=1 -f import-render-data.sql
--
-- Source is the `scratch_render` database (a restore of the Render dump), read
-- over dblink. Run against `scratch_live` first to check the numbers, then the
-- real `poolcare` DB. Wrapped in a transaction: any error rolls the whole thing back.
--
-- Transformations:
--   * orgId remapped from the Render org to the live PoolCare org
--   * phones normalised to 0XXXXXXXXX — login matches users by phone, and the
--     Render data mixes +233…, 233…, 0…, and space-separated formats
--   * exact duplicate rows (same normalised phone AND same name) collapsed —
--     this drops the doubled "Mary" client and the doubled "Nana" carer, while
--     keeping KADIJAH AMOAH / Richard Okyere-Fosu who merely share a phone
--   * Carer.userId is required: reuse a live User with the same normalised
--     phone where one exists, otherwise create the User
-- Re-runnable: every insert skips ids that are already present.

BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink;

\set render_org '''b956286c-2043-4cfa-9880-a6c4ccb24106'''
\set live_org   '''fa24d7ed-a7d9-44c8-9574-2eb6ea178367'''

CREATE OR REPLACE FUNCTION pg_temp.normph(t text) RETURNS text AS $fn$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(coalesce($1, ''), '[^0-9]', '', 'g'),
           '^233', '0'),
         '^([^0])', '0\1')
$fn$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------- carers ----
CREATE TEMP TABLE r_carer AS
SELECT * FROM dblink('dbname=scratch_render user=poolcare', $q$
  SELECT c.id, c."userId", c.name, c.phone, u.phone AS user_phone,
         c."homeBaseLat", c."homeBaseLng", c.active, c."createdAt", c.currency,
         c."ratePerVisitCents", c."currentLat", c."currentLng", c."imageUrl",
         c."lastLocationUpdate"
  FROM "Carer" c JOIN "User" u ON u.id = c."userId"
$q$) AS t(id uuid, user_id uuid, name text, phone text, user_phone text,
          home_lat float8, home_lng float8, active boolean, created_at timestamptz,
          currency text, rate_cents int, cur_lat float8, cur_lng float8,
          image_url text, last_loc timestamptz);

-- collapse duplicates: same person written two ways
CREATE TEMP TABLE carer_dedup AS
SELECT DISTINCT ON (pg_temp.normph(user_phone), lower(btrim(name))) *
FROM r_carer
ORDER BY pg_temp.normph(user_phone), lower(btrim(name)), created_at;

-- resolve each carer to a live User: existing match by phone, else the Render user
CREATE TEMP TABLE carer_user AS
SELECT d.id AS carer_id,
       coalesce(live.id, d.user_id) AS user_id,
       (live.id IS NOT NULL) AS reused_existing,
       d.name, d.phone, d.user_phone, d.home_lat, d.home_lng, d.active,
       d.created_at, d.currency, d.rate_cents, d.cur_lat, d.cur_lng,
       d.image_url, d.last_loc
FROM carer_dedup d
LEFT JOIN LATERAL (
  SELECT u.id FROM "User" u
  WHERE pg_temp.normph(u.phone) = pg_temp.normph(d.user_phone)
    AND pg_temp.normph(d.user_phone) <> ''
  ORDER BY u."createdAt" LIMIT 1
) live ON true;

INSERT INTO "User" (id, phone, name, "createdAt", "updatedAt")
SELECT user_id, pg_temp.normph(user_phone), name, now(), now()
FROM carer_user
WHERE NOT reused_existing
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = carer_user.user_id);

INSERT INTO "Carer" (id, "orgId", "userId", name, phone, "homeBaseLat", "homeBaseLng",
                     active, "createdAt", currency, "ratePerVisitCents",
                     "currentLat", "currentLng", "imageUrl", "lastLocationUpdate")
SELECT carer_id, :live_org::uuid, user_id, name, pg_temp.normph(phone),
       home_lat, home_lng, active, created_at, currency, rate_cents,
       cur_lat, cur_lng, image_url, last_loc
FROM carer_user
WHERE NOT EXISTS (SELECT 1 FROM "Carer" c WHERE c.id = carer_user.carer_id);

-- --------------------------------------------------------------- clients ----
CREATE TEMP TABLE r_client AS
SELECT * FROM dblink('dbname=scratch_render user=poolcare', $q$
  SELECT id, "userId", "householdId", name, email, phone, "imageUrl",
         "billingAddress", "preferredChannels", notes, "createdAt"
  FROM "Client"
$q$) AS t(id uuid, user_id uuid, household_id uuid, name text, email text,
          phone text, image_url text, billing_address text,
          preferred_channels text[], notes text, created_at timestamptz);

-- drop exact duplicates only (same phone AND same name)
CREATE TEMP TABLE client_dedup AS
SELECT DISTINCT ON (pg_temp.normph(phone), lower(btrim(name))) *
FROM r_client
ORDER BY pg_temp.normph(phone), lower(btrim(name)), created_at;

-- clients keep no user link: their Render users are not being migrated
INSERT INTO "Client" (id, "orgId", "userId", "householdId", name, email, phone,
                      "imageUrl", "billingAddress", "preferredChannels", notes, "createdAt")
SELECT id, :live_org::uuid, NULL, NULL, name, nullif(btrim(email), ''),
       nullif(pg_temp.normph(phone), ''), image_url, billing_address,
       coalesce(preferred_channels, ARRAY['WHATSAPP']), notes, created_at
FROM client_dedup
WHERE NOT EXISTS (SELECT 1 FROM "Client" c WHERE c.id = client_dedup.id);

-- ----------------------------------------------------------------- pools ----
CREATE TEMP TABLE r_pool AS
SELECT * FROM dblink('dbname=scratch_render user=poolcare', $q$
  SELECT id, "clientId", name, address, lat, lng, "volumeL", "surfaceType",
         equipment, targets, notes, "createdAt", "imageUrls", "poolType",
         "filtrationType", dimensions
  FROM "Pool"
$q$) AS t(id uuid, client_id uuid, name text, address text, lat float8, lng float8,
          volume_l int, surface_type text, equipment jsonb, targets jsonb,
          notes text, created_at timestamptz, image_urls text[], pool_type text,
          filtration_type text, dimensions jsonb);

-- only pools whose owning client survived the import
INSERT INTO "Pool" (id, "orgId", "clientId", name, address, lat, lng, "volumeL",
                    "surfaceType", equipment, targets, notes, "createdAt",
                    "imageUrls", "poolType", "filtrationType", dimensions)
SELECT p.id, :live_org::uuid, p.client_id, p.name, p.address, p.lat, p.lng,
       p.volume_l, p.surface_type, p.equipment, p.targets, p.notes, p.created_at,
       p.image_urls, p.pool_type, p.filtration_type, p.dimensions
FROM r_pool p
WHERE EXISTS (SELECT 1 FROM "Client" c WHERE c.id = p.client_id)
  AND NOT EXISTS (SELECT 1 FROM "Pool" x WHERE x.id = p.id);

-- ---------------------------------------------------------------- report ----
\echo '--- imported (this database) ---'
SELECT 'Carer' AS table, count(*) FROM "Carer"
UNION ALL SELECT 'Client', count(*) FROM "Client"
UNION ALL SELECT 'Pool',   count(*) FROM "Pool"
UNION ALL SELECT 'User',   count(*) FROM "User";

\echo '--- pools orphaned (client did not survive) ---'
SELECT p.name FROM r_pool p WHERE NOT EXISTS (SELECT 1 FROM "Client" c WHERE c.id = p.client_id);

COMMIT;
