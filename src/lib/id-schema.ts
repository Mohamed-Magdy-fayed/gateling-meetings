import { z } from "zod";

/**
 * Validates a primary key coming from outside (a tRPC input, a signed cookie,
 * a query parameter). Every id in this app is a Postgres `uuid` column.
 *
 * `z.guid()` and not `z.uuid()`: since Zod 4, `z.uuid()` enforces the RFC 9562
 * version and variant nibbles, which is *stricter than the database*. Postgres
 * accepts any 8-4-4-4-12 hex string, and this app has ids that use that
 * freedom — the seeded organizations and accounts
 * (`drizzle/seed/constants.ts`) are hand-written values like
 * `00000000-0000-0000-0000-0000000000b1`, which carry no version nibble and so
 * fail `z.uuid()` while being perfectly valid rows.
 *
 * The practical effect of getting this wrong is a validator that rejects the
 * app's own identifiers: the Google Forms connect handshake failed with
 * `invalid_state` for every seeded organization because its state cookie
 * validated the organization id with `z.uuid()`.
 *
 * `z.guid()` still rejects anything that isn't a uuid shape, which is all this
 * check is for — authorization is always done against the database, never by
 * the shape of the id.
 */
export const idSchema = z.guid();
