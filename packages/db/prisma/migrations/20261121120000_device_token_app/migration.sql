-- Each app (carer / client) keeps its own push token per user per platform,
-- so opening one app no longer wipes the other's registration.
ALTER TABLE "DeviceToken" ADD COLUMN "app" TEXT NOT NULL DEFAULT 'carer';
UPDATE "DeviceToken" SET "app" = 'client' WHERE "clientId" IS NOT NULL;
DROP INDEX IF EXISTS "DeviceToken_userId_platform_key";
CREATE UNIQUE INDEX "DeviceToken_userId_platform_app_key" ON "DeviceToken"("userId", "platform", "app");
