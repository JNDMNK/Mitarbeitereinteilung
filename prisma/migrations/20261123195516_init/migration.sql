-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "employeeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "hideWeekends" BOOLEAN NOT NULL DEFAULT false,
    "planningView" TEXT NOT NULL DEFAULT 'cards',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT 'Mein Betrieb',
    "logoFile" TEXT,
    "defaultStartMin" INTEGER NOT NULL DEFAULT 420,
    "defaultEndMin" INTEGER NOT NULL DEFAULT 960,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "licensePlate" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "seats" INTEGER NOT NULL,
    "defaultDriverId" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vehicle_defaultDriverId_fkey" FOREIGN KEY ("defaultDriverId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleDefaultMember" (
    "vehicleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("vehicleId", "employeeId"),
    CONSTRAINT "VehicleDefaultMember_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VehicleDefaultMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Site" (
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
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AbsenceType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Absence_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AbsenceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleDay_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleDayId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewMember_vehicleDayId_fkey" FOREIGN KEY ("vehicleDayId") REFERENCES "VehicleDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrewMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleDayId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiteAssignment_vehicleDayId_fkey" FOREIGN KEY ("vehicleDayId") REFERENCES "VehicleDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "date" TEXT,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_shortName_key" ON "Employee"("shortName");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_active_lastName_idx" ON "Employee"("active", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_licensePlate_key" ON "Vehicle"("licensePlate");

-- CreateIndex
CREATE INDEX "Site_status_active_idx" ON "Site"("status", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceType_name_key" ON "AbsenceType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceType_code_key" ON "AbsenceType"("code");

-- CreateIndex
CREATE INDEX "Absence_employeeId_startDate_endDate_idx" ON "Absence"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Absence_startDate_endDate_idx" ON "Absence"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "VehicleDay_date_idx" ON "VehicleDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDay_date_vehicleId_key" ON "VehicleDay"("date", "vehicleId");

-- CreateIndex
CREATE INDEX "CrewMember_vehicleDayId_idx" ON "CrewMember"("vehicleDayId");

-- CreateIndex
CREATE UNIQUE INDEX "CrewMember_date_employeeId_key" ON "CrewMember"("date", "employeeId");

-- CreateIndex
CREATE INDEX "SiteAssignment_vehicleDayId_startMin_idx" ON "SiteAssignment"("vehicleDayId", "startMin");

-- CreateIndex
CREATE INDEX "SiteAssignment_siteId_idx" ON "SiteAssignment"("siteId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_date_idx" ON "AuditLog"("date");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
