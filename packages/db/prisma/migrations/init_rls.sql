-- RLS Helper Functions
-- Run this after initial migration

-- Enable RLS on all tables
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OtpRequest" ENABLE ROW LEVEL SECURITY;

-- Helper function to check role
CREATE OR REPLACE FUNCTION is_role(check_role TEXT) RETURNS BOOLEAN AS $$
  SELECT current_setting('app.role', true) = check_role;
$$ LANGUAGE SQL STABLE;

-- Organization policies
CREATE POLICY org_isolation ON "Organization"
  FOR ALL
  USING (
    id IN (
      SELECT "orgId" FROM "OrgMember" 
      WHERE "userId"::text = current_setting('app.user_id', true)
    )
  );

-- OrgMember policies (admin/manager can CRUD, others read-only for their memberships)
CREATE POLICY org_member_select ON "OrgMember"
  FOR SELECT
  USING (
    "orgId"::text = current_setting('app.org_id', true)
    AND (
      is_role('ADMIN') OR is_role('MANAGER') 
      OR "userId"::text = current_setting('app.user_id', true)
    )
  );

CREATE POLICY org_member_modify ON "OrgMember"
  FOR ALL
  USING (
    "orgId"::text = current_setting('app.org_id', true)
    AND (is_role('ADMIN') OR is_role('MANAGER'))
  );

-- User policies (users can read their own, admins/managers can read org members)
CREATE POLICY user_isolation ON "User"
  FOR SELECT
  USING (
    id::text = current_setting('app.user_id', true)
    OR EXISTS (
      SELECT 1 FROM "OrgMember" om
      WHERE om."userId" = "User".id
      AND om."orgId"::text = current_setting('app.org_id', true)
      AND (is_role('ADMIN') OR is_role('MANAGER'))
    )
  );

-- OtpRequest (limited - can read own requests)
CREATE POLICY otp_self ON "OtpRequest"
  FOR SELECT
  USING (
    "target" IN (
      SELECT COALESCE("phone", "email") FROM "User"
      WHERE id::text = current_setting('app.user_id', true)
    )
    OR is_role('ADMIN')
  );

