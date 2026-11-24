-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Absence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "note" TEXT,
    "withVehicle" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Absence_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AbsenceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Absence" ("createdAt", "employeeId", "endDate", "id", "note", "startDate", "typeId", "updatedAt", "version") SELECT "createdAt", "employeeId", "endDate", "id", "note", "startDate", "typeId", "updatedAt", "version" FROM "Absence";
DROP TABLE "Absence";
ALTER TABLE "new_Absence" RENAME TO "Absence";
CREATE INDEX "Absence_employeeId_startDate_endDate_idx" ON "Absence"("employeeId", "startDate", "endDate");
CREATE INDEX "Absence_startDate_endDate_idx" ON "Absence"("startDate", "endDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
