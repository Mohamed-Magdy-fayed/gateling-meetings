import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/data/env/server";
import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn = globalForDb.conn ?? postgres(env.DATABASE_URL);
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });

export type Database = typeof db;

/**
 * What `db.transaction(...)` hands its callback: the same query surface as
 * `db`, minus the connection handle.
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * For query helpers that a caller may need to run inside an open transaction —
 * passing `db` there would check out a second connection and read outside the
 * transaction's snapshot.
 */
export type DatabaseOrTransaction = Database | Transaction;

export async function closeDbConnection() {
  await conn.end({ timeout: 5 });
}
