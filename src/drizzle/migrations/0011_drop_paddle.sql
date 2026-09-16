-- Data step (hand-added): the Paddle integration is being removed. Its stored
-- webhook rows are keyed by a Paddle event id that this migration drops, and
-- migration 0012 adds a NOT NULL provider event id that they cannot have.
-- They were sandbox deliveries only (Paddle never went live), so they are
-- deleted rather than backfilled.
DELETE FROM "billing_events";--> statement-breakpoint
ALTER TABLE "paddle_customers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "paddle_subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "paddle_customers" CASCADE;--> statement-breakpoint
DROP TABLE "paddle_subscriptions" CASCADE;--> statement-breakpoint
DROP INDEX "billing_events_paddle_event_unique";--> statement-breakpoint
DROP INDEX "organizations_paddle_subscription_unique";--> statement-breakpoint
DROP INDEX "organizations_paddle_customer_idx";--> statement-breakpoint
ALTER TABLE "billing_events" DROP COLUMN "paddleEventId";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "paddleCustomerId";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "paddleSubscriptionId";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "paddleSubscriptionStatus";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "paddlePriceId";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "currentPeriodEndsAt";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "paddleSyncedAt";