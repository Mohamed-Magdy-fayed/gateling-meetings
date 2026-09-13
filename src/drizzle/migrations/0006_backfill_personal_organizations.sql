-- Data migration (hand-written by design): every existing user gets a personal
-- organization on the free plan, becomes its owner, and every meeting they
-- host is attached to it. Soft-deleted users are included so that 0007 can
-- make meetings.organizationId NOT NULL without stranding their rows.
-- Idempotent: re-running creates nothing that already exists.
INSERT INTO "organizations" ("id", "name", "personalOwnerId", "plan", "planSource", "seatLimit", "createdBy")
SELECT gen_random_uuid(),
       LEFT(COALESCE(NULLIF(u."name", ''), split_part(u."email", '@', 1)), 128),
       u."id",
       'free',
       'free',
       1,
       'migration:0006'
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "organizations" o WHERE o."personalOwnerId" = u."id");--> statement-breakpoint
INSERT INTO "organization_memberships" ("organizationId", "userId", "role", "createdBy")
SELECT o."id", o."personalOwnerId", 'owner', 'migration:0006'
FROM "organizations" o
WHERE o."personalOwnerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "organization_memberships" m
    WHERE m."organizationId" = o."id" AND m."userId" = o."personalOwnerId"
  );--> statement-breakpoint
UPDATE "meetings" m
SET "organizationId" = o."id"
FROM "organizations" o
WHERE o."personalOwnerId" = m."hostId"
  AND m."organizationId" IS NULL;
