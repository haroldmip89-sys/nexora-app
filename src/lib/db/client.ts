import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

/**
 * Drizzle client for Neon (WebSocket Pool, interactive transactions).
 * Server-only, Node.js runtime. The connection is created lazily on first use
 * so importing this module without DATABASE_URL does not throw.
 * No `schema` is passed: modules use the query builder with their own tables.
 */
function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not defined. Set it in .env.local.");
  }
  return drizzle(new Pool({ connectionString }));
}

type Db = ReturnType<typeof createDb>;

export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

let instance: Db | undefined;

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= createDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
