-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SiteAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleDayId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "note" TEXT,
    "fixed" BOOLEAN NOT NULL DEFAULT false,
    "fixedTimeMin" INTEGER,
    "fixedNote" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiteAssignment_vehicleDayId_fkey" FOREIGN KEY ("vehicleDayId") REFERENCES "VehicleDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SiteAssignment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SiteAssignment" ("createdAt", "endMin", "id", "note", "siteId", "startMin", "updatedAt", "updatedById", "vehicleDayId", "version") SELECT "createdAt", "endMin", "id", "note", "siteId", "startMin", "updatedAt", "updatedById", "vehicleDayId", "version" FROM "SiteAssignment";
DROP TABLE "SiteAssignment";
ALTER TABLE "new_SiteAssignment" RENAME TO "SiteAssignment";
CREATE INDEX "SiteAssignment_vehicleDayId_startMin_idx" ON "SiteAssignment"("vehicleDayId", "startMin");
CREATE INDEX "SiteAssignment_siteId_idx" ON "SiteAssignment"("siteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
