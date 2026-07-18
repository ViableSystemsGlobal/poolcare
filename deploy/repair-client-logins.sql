-- Repair client-app access for the clients imported from Render.
--
--   psql -U poolcare -d poolcare -v ON_ERROR_STOP=1 -f repair-client-logins.sql
--
-- The Render import deliberately left Client.userId NULL (their user accounts
-- were not migrated). But the client app requires, for each client:
--     a User row  +  Client.userId pointing at it  +  an OrgMember CLIENT row
-- so with userId NULL nobody could log in — the API returns
-- "You don't have access yet. Contact your organization to get an invite."
--
-- This mirrors ClientsService.create() exactly: match an existing User by
-- email then phone, create one otherwise, then upsert the CLIENT membership.
-- Clients sharing a phone (data-entry duplicates) link to the SAME user, which
-- is also what the app does. Clients with neither phone nor email are skipped —
-- they have no way to authenticate.
-- Transactional and re-runnable.

BEGIN;

\set live_org '''fa24d7ed-a7d9-44c8-9574-2eb6ea178367'''

CREATE OR REPLACE FUNCTION pg_temp.normph(t text) RETURNS text AS $fn$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(coalesce($1, ''), '[^0-9]', '', 'g'),
           '^233', '0'),
         '^([^0])', '0\1')
$fn$ LANGUAGE sql IMMUTABLE;

-- 1. link to an existing User by email
UPDATE "Client" c SET "userId" = u.id
FROM "User" u
WHERE c."userId" IS NULL
  AND nullif(btrim(c.email), '') IS NOT NULL
  AND lower(u.email) = lower(btrim(c.email));

-- 2. link to an existing User by normalised phone
UPDATE "Client" c SET "userId" = u.id
FROM "User" u
WHERE c."userId" IS NULL
  AND pg_temp.normph(c.phone) <> ''
  AND pg_temp.normph(u.phone) = pg_temp.normph(c.phone);

-- 3. create one User per remaining distinct phone
CREATE TEMP TABLE new_users AS
SELECT DISTINCT ON (pg_temp.normph(phone))
       gen_random_uuid() AS user_id,
       pg_temp.normph(phone) AS phone,
       nullif(btrim(email), '') AS email,
       name
FROM "Client"
WHERE "userId" IS NULL AND pg_temp.normph(phone) <> ''
ORDER BY pg_temp.normph(phone), "createdAt";

INSERT INTO "User" (id, phone, email, name, "createdAt", "updatedAt")
SELECT user_id, phone, email, name, now(), now() FROM new_users;

UPDATE "Client" c SET "userId" = n.user_id
FROM new_users n
WHERE c."userId" IS NULL AND pg_temp.normph(c.phone) = n.phone;

-- 4. every linked client needs a CLIENT membership in this org
INSERT INTO "OrgMember" (id, "orgId", "userId", role, "createdAt")
SELECT gen_random_uuid(), :live_org::uuid, c."userId", 'CLIENT', now()
FROM (SELECT DISTINCT "userId" FROM "Client" WHERE "userId" IS NOT NULL) c
WHERE NOT EXISTS (
  SELECT 1 FROM "OrgMember" m
  WHERE m."orgId" = :live_org::uuid AND m."userId" = c."userId" AND m.role = 'CLIENT'
);

\echo '--- result ---'
SELECT (SELECT count(*) FROM "Client") AS clients,
       (SELECT count(*) FROM "Client" WHERE "userId" IS NOT NULL) AS linked,
       (SELECT count(*) FROM "Client" WHERE "userId" IS NULL) AS unlinked,
       (SELECT count(*) FROM "OrgMember" WHERE role = 'CLIENT') AS client_memberships,
       (SELECT count(*) FROM "User") AS users;

\echo '--- clients still unable to log in (no phone, no email) ---'
SELECT name FROM "Client" WHERE "userId" IS NULL;

COMMIT;
