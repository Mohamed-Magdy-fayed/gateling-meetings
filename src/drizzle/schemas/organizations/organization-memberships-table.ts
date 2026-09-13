import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { UsersTable } from "@/drizzle/schemas/auth";
import {
  createdAt,
  createdBy,
  id,
  updatedAt,
  updatedBy,
} from "@/drizzle/schemas/helpers";
import { OrganizationsTable } from "./organizations-table";

export const organizationRoleValues = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof organizationRoleValues)[number];
export const organizationRoleEnum = pgEnum(
  "organization_role",
  organizationRoleValues,
);

/**
 * Who belongs to an org and what they may do there. A user's role can differ
 * per org, which is why there is no global `users.role` column.
 */
export const OrganizationMembershipsTable = pgTable(
  "organization_memberships",
  {
    id,
    organizationId: uuid()
      .notNull()
      .references(() => OrganizationsTable.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => UsersTable.id, { onDelete: "cascade" }),
    role: organizationRoleEnum().notNull().default("member"),
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
  },
  (table) => [
    uniqueIndex("organization_memberships_org_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_memberships_user_idx").on(table.userId),
  ],
);

export const organizationMembershipsRelations = relations(
  OrganizationMembershipsTable,
  ({ one }) => ({
    organization: one(OrganizationsTable, {
      fields: [OrganizationMembershipsTable.organizationId],
      references: [OrganizationsTable.id],
    }),
    user: one(UsersTable, {
      fields: [OrganizationMembershipsTable.userId],
      references: [UsersTable.id],
    }),
  }),
);

export type OrganizationMembership =
  typeof OrganizationMembershipsTable.$inferSelect;
