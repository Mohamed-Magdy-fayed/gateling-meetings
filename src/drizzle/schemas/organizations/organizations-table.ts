import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { UsersTable } from "@/drizzle/schemas/auth";
import {
  createdAt,
  createdBy,
  deletedAt,
  deletedBy,
  id,
  updatedAt,
  updatedBy,
} from "@/drizzle/schemas/helpers";
import { OrganizationMembershipsTable } from "./organization-memberships-table";

export const planValues = ["free", "pro", "business"] as const;
export type PlanId = (typeof planValues)[number];
export const planEnum = pgEnum("plan", planValues);

/**
 * *Why* an org is on its plan. Enforcement never looks at this — it only
 * reads the resolved entitlements — but writers do: billing webhooks only
 * ever touch `subscription`/`free` orgs, so a `manual` grant made from the
 * admin panel is never clobbered by a stray Paddle event.
 */
export const planSourceValues = [
  "free",
  "subscription",
  "manual",
  "trial",
] as const;
export type PlanSource = (typeof planSourceValues)[number];
export const planSourceEnum = pgEnum("plan_source", planSourceValues);

/**
 * The billing and membership boundary. Every user owns exactly one personal
 * org (`personalOwnerId` set), created on first sign-in; team orgs leave it
 * null. Meetings and integrations hang off an org, so the plan that applies
 * to a room is the plan of the org that owns the meeting — never the
 * joiner's.
 */
export const OrganizationsTable = pgTable(
  "organizations",
  {
    id,
    name: varchar({ length: 128 }).notNull(),
    personalOwnerId: uuid().references(() => UsersTable.id, {
      onDelete: "cascade",
    }),
    plan: planEnum().notNull().default("free"),
    planSource: planSourceEnum().notNull().default("free"),
    /** After this instant a manual/trial/lapsed plan resolves to `free`. */
    planExpiresAt: timestamp({ withTimezone: true }),
    /** Admin-facing note: who comped this org and why. */
    planNote: text(),
    seatLimit: integer().notNull().default(1),
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    deletedAt,
    deletedBy,
  },
  (table) => [
    uniqueIndex("organizations_personal_owner_unique").on(
      table.personalOwnerId,
    ),
  ],
);

export const organizationsRelations = relations(
  OrganizationsTable,
  ({ many, one }) => ({
    memberships: many(OrganizationMembershipsTable),
    personalOwner: one(UsersTable, {
      fields: [OrganizationsTable.personalOwnerId],
      references: [UsersTable.id],
    }),
  }),
);

export type Organization = typeof OrganizationsTable.$inferSelect;
export type NewOrganization = typeof OrganizationsTable.$inferInsert;
