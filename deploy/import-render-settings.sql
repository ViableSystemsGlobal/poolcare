-- Import the OrgSetting row (branding, policies, tax, templates, flags, integrations)
-- from the Render export into the live poolcare database.
--
--   psql -U poolcare -d poolcare -v ON_ERROR_STOP=1 -f import-render-settings.sql
--
-- Image URLs in `profile` are rewritten from Render's host to this API's host;
-- the files themselves are copied across first by migrate-render-files.sh.
--
-- `integrations` (sms, smtp, paystack, llm, googleMaps) holds values encrypted
-- with SETTINGS_ENCRYPTION_KEY. They are carried over verbatim — if this VPS's
-- key differs from Render's they will NOT decrypt and those credentials must be
-- re-entered in Settings. Check SMS after running this.

BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink;

\set live_org '''fa24d7ed-a7d9-44c8-9574-2eb6ea178367'''

CREATE TEMP TABLE r_settings AS
SELECT * FROM dblink('dbname=scratch_render user=poolcare', $q$
  SELECT profile::text, policies::text, tax::text, templates::text,
         integrations::text, flags::text
  FROM "OrgSetting"
  LIMIT 1
$q$) AS t(profile text, policies text, tax text, templates text,
          integrations text, flags text);

INSERT INTO "OrgSetting" (id, "orgId", profile, policies, tax, templates,
                          integrations, flags, "createdAt", "updatedAt")
SELECT gen_random_uuid(), :live_org::uuid,
       replace(profile, 'https://poolcare-ef74.onrender.com',
                        'https://api.poolcare.africa')::jsonb,
       policies::jsonb, tax::jsonb, templates::jsonb,
       integrations::jsonb, flags::jsonb, now(), now()
FROM r_settings
ON CONFLICT ("orgId") DO UPDATE SET
  profile      = EXCLUDED.profile,
  policies     = EXCLUDED.policies,
  tax          = EXCLUDED.tax,
  templates    = EXCLUDED.templates,
  integrations = EXCLUDED.integrations,
  flags        = EXCLUDED.flags,
  "updatedAt"  = now();

\echo '--- branding now live ---'
SELECT profile->>'name' AS name,
       profile->>'customColorHex' AS colour,
       profile->>'themeColor' AS theme,
       profile->>'logoUrl' AS logo
FROM "OrgSetting" WHERE "orgId" = :live_org::uuid;

\echo '--- any Render URLs left behind? (should be 0) ---'
SELECT count(*) AS stale_render_urls
FROM "OrgSetting"
WHERE "orgId" = :live_org::uuid AND profile::text LIKE '%onrender.com%';

COMMIT;
