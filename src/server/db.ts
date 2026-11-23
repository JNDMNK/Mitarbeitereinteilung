import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

function sqlitePath(url: string): string {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: sqlitePath(env().databaseUrl),
    // Wartet bei gleichzeitigen Schreibzugriffen statt sofort "database is locked"
    timeout: 10_000,
  });
  const client = new PrismaClient({ adapter });
  // WAL: Lesen blockiert Schreiben nicht (wichtig für SSE + mehrere Clients)
  void client.$executeRawUnsafe("PRAGMA journal_mode = WAL;").catch(() => {});
  void client.$executeRawUnsafe("PRAGMA foreign_keys = ON;").catch(() => {});
  return client;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();
if (!env().isProd) globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type DbOrTx = PrismaClient | Tx;
