/**
 * Seed für die lokale Entwicklung (`npm run db:seed`). Idempotent.
 *  - immer:       Einstellungen, Abwesenheitsarten
 *  - SEED_DEMO=1: Abteilungen, Beispiel-Mitarbeiter, Fahrzeuge, Baustellen, Test-Logins
 *    (Standard außerhalb von production)
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { ensureDefaultDepartment, seedBase, seedDemo } from "../src/server/seed-data";

const url = (process.env.DATABASE_URL ?? "file:./data/dev.db").replace(/^file:/, "");
const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  await seedBase(db);
  const demo = process.env.SEED_DEMO ?? (process.env.NODE_ENV === "production" ? "0" : "1");
  if (demo === "1") {
    await seedDemo(db, { withLogins: true });
    console.log("Seed: Basis- und Demodaten angelegt (Test-Logins: admin / einteiler / max / jonas, Passwort: Passwort123!).");
  } else {
    await ensureDefaultDepartment(db);
    console.log("Seed: Basisdaten angelegt.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
