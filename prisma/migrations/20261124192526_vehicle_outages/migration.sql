-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "serviceDue" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "tuevDue" TEXT;

-- CreateTable
CREATE TABLE "VehicleOutage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'WORKSHOP',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleOutage_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VehicleOutage_vehicleId_startDate_endDate_idx" ON "VehicleOutage"("vehicleId", "startDate", "endDate");
