-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "customer" TEXT,
    "orderNumber" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "color" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "adHoc" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Site" ("active", "address", "color", "createdAt", "customer", "endDate", "id", "name", "note", "orderNumber", "startDate", "status", "updatedAt", "version") SELECT "active", "address", "color", "createdAt", "customer", "endDate", "id", "name", "note", "orderNumber", "startDate", "status", "updatedAt", "version" FROM "Site";
DROP TABLE "Site";
ALTER TABLE "new_Site" RENAME TO "Site";
CREATE INDEX "Site_status_active_idx" ON "Site"("status", "active");
CREATE INDEX "Site_adHoc_active_idx" ON "Site"("adHoc", "active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
