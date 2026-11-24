-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "deactivatedAt" DATETIME;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "deactivatedAt" DATETIME;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "deactivatedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT 'Mein Betrieb',
    "logoFile" TEXT,
    "defaultStartMin" INTEGER NOT NULL DEFAULT 420,
    "defaultEndMin" INTEGER NOT NULL DEFAULT 960,
    "autoDeleteSiteDays" INTEGER NOT NULL DEFAULT 30,
    "autoDeleteEmployeeDays" INTEGER NOT NULL DEFAULT 30,
    "autoDeleteVehicleDays" INTEGER NOT NULL DEFAULT 30,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("companyName", "defaultEndMin", "defaultStartMin", "id", "logoFile", "updatedAt", "version") SELECT "companyName", "defaultEndMin", "defaultStartMin", "id", "logoFile", "updatedAt", "version" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Bereits deaktivierte Einträge: Frist läuft ab jetzt (nicht rückwirkend)
UPDATE "Employee" SET "deactivatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now') WHERE "active" = 0;
UPDATE "Vehicle" SET "deactivatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now') WHERE "active" = 0;
UPDATE "Site" SET "deactivatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now') WHERE "active" = 0;
