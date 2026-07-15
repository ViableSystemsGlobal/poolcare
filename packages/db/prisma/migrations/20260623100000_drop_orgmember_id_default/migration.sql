-- Drop the vestigial DB-level default on OrgMember.id. The column gained a
-- gen_random_uuid() default when `id` was back-added to a table that originally
-- had a composite PK; the schema uses app-side @default(uuid()), so the DB
-- default was never intended. All inserts go through Prisma, which supplies id.
ALTER TABLE "OrgMember" ALTER COLUMN "id" DROP DEFAULT;
