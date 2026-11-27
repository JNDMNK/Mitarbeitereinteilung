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
    "planningRetentionYears" INTEGER NOT NULL DEFAULT 1,
    "absenceRetentionYears" INTEGER NOT NULL DEFAULT 2,
    "auditRetentionYears" INTEGER NOT NULL DEFAULT 1,
    "lastVacuumAt" DATETIME,
    "weekCrews" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("autoDeleteEmployeeDays", "autoDeleteSiteDays", "autoDeleteVehicleDays", "companyName", "defaultEndMin", "defaultStartMin", "id", "logoFile", "planningRetentionYears", "updatedAt", "version", "weekCrews") SELECT "autoDeleteEmployeeDays", "autoDeleteSiteDays", "autoDeleteVehicleDays", "companyName", "defaultEndMin", "defaultStartMin", "id", "logoFile", "planningRetentionYears", "updatedAt", "version", "weekCrews" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
