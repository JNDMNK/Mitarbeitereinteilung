/**
 * Grund- und Demodaten. Wird vom Dev-Seed (prisma/seed.ts) und beim Serverstart
 * (bootstrap) verwendet. Bewusst ohne "server-only", damit tsx es laden kann.
 */
import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "@/generated/prisma/client";

const ABSENCE_TYPES = [
  { name: "Urlaub", code: "U", color: "#16a34a" },
  { name: "Krank", code: "K", color: "#dc2626" },
  { name: "Berufsschule", code: "BS", color: "#2563eb" },
  { name: "Schulung", code: "S", color: "#7c3aed" },
  { name: "Überstundenabbau", code: "ÜA", color: "#d97706" },
  { name: "Sonstiges", code: "SO", color: "#64748b" },
];

const DEPARTMENTS = [
  { name: "Elektro", color: "#f59e0b" },
  { name: "Sanitär", color: "#0ea5e9" },
  { name: "Heizung", color: "#ef4444" },
];

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

export async function seedBase(db: PrismaClient) {
  await db.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  for (const [i, t] of ABSENCE_TYPES.entries()) {
    await db.absenceType.upsert({ where: { code: t.code }, update: {}, create: { ...t, sortOrder: i } });
  }
}

export async function seedDemo(db: PrismaClient, opts: { withLogins: boolean }) {
  for (const [i, d] of DEPARTMENTS.entries()) {
    await db.department.upsert({ where: { name: d.name }, update: {}, create: { ...d, sortOrder: i } });
  }
  const deps = Object.fromEntries((await db.department.findMany()).map((d) => [d.name, d.id]));
  const employees = [
    ["Max", "Müller", "MMU", "MEISTER", "Elektro"],
    ["Stefan", "Schmidt", "SSC", "GESELLE", "Elektro"],
    ["Jonas", "Weber", "JWE", "AZUBI_2", "Elektro"],
    ["Lena", "Fischer", "LFI", "AZUBI_1", "Elektro"],
    ["Thomas", "Wagner", "TWA", "GESELLE", "Sanitär"],
    ["Markus", "Becker", "MBE", "MEISTER", "Sanitär"],
    ["Tim", "Hoffmann", "THO", "AZUBI_3", "Sanitär"],
    ["Paul", "Schäfer", "PSC", "GESELLE", "Heizung"],
    ["Felix", "Koch", "FKO", "AZUBI_4", "Heizung"],
    ["Andreas", "Richter", "ARI", "GESELLE", "Heizung"],
    ["Lukas", "Klein", "LKL", "AZUBI_1", "Heizung"],
    ["Daniel", "Wolf", "DWO", "GESELLE", "Elektro"],
  ] as const;
  const emp: Record<string, string> = {};
  for (const [firstName, lastName, shortName, qualification, dep] of employees) {
    const e = await db.employee.upsert({
      where: { shortName },
      update: {},
      create: { firstName, lastName, shortName, qualification, departmentId: deps[dep], phone: "0170 1234567" },
    });
    emp[shortName] = e.id;
  }

  const vehicles = [
    { licensePlate: "WÜ-EL 101", name: "Sprinter 1", type: "Transporter", seats: 3, driver: "MMU", members: ["JWE"] },
    { licensePlate: "WÜ-EL 102", name: "Sprinter 2", type: "Transporter", seats: 3, driver: "SSC", members: ["LFI"] },
    { licensePlate: "WÜ-SH 201", name: "Crafter", type: "Transporter", seats: 3, driver: "TWA", members: ["THO"] },
    { licensePlate: "WÜ-HZ 301", name: "Vito", type: "Transporter", seats: 2, driver: "PSC", members: ["FKO"] },
    { licensePlate: "WÜ-HZ 302", name: "Caddy", type: "PKW", seats: 2, driver: "ARI", members: [] },
    { licensePlate: "WÜ-MB 401", name: "Meister-PKW", type: "PKW", seats: 5, driver: "MBE", members: [] },
  ];
  for (const [i, v] of vehicles.entries()) {
    const vehicle = await db.vehicle.upsert({
      where: { licensePlate: v.licensePlate },
      update: {},
      create: { licensePlate: v.licensePlate, name: v.name, type: v.type, seats: v.seats, defaultDriverId: emp[v.driver], sortOrder: i },
    });
    for (const [j, m] of v.members.entries()) {
      await db.vehicleDefaultMember.upsert({
        where: { vehicleId_employeeId: { vehicleId: vehicle.id, employeeId: emp[m] } },
        update: {},
        create: { vehicleId: vehicle.id, employeeId: emp[m], sortOrder: j },
      });
    }
  }

  const sites = [
    { name: "Neubau Kita Sonnenschein", address: "Sonnenstraße 12, 97070 Würzburg", customer: "Stadt Würzburg", orderNumber: "A-2026-101", color: "#22c55e", status: "ACTIVE", startDate: isoDate(-14), endDate: isoDate(30) },
    { name: "Sanierung Mehrfamilienhaus", address: "Hauptstraße 5, 97082 Würzburg", customer: "Wohnbau GmbH", orderNumber: "A-2026-102", color: "#3b82f6", status: "ACTIVE", startDate: isoDate(-3), endDate: isoDate(10) },
    { name: "Bürogebäude Technologiepark", address: "Friedrich-Bergius-Ring 15, 97076 Würzburg", customer: "TechPark AG", orderNumber: "A-2026-103", color: "#a855f7", status: "PLANNED", startDate: isoDate(2), endDate: isoDate(60) },
    { name: "Einfamilienhaus Familie Braun", address: "Am Hang 3, 97218 Gerbrunn", customer: "Familie Braun", orderNumber: "A-2026-104", color: "#f97316", status: "ACTIVE", startDate: isoDate(0), endDate: isoDate(4) },
    { name: "Kundendienst / Kleinaufträge", address: null, customer: null, orderNumber: null, color: "#64748b", status: "ACTIVE", startDate: null, endDate: null },
  ];
  for (const s of sites) {
    const existing = await db.site.findFirst({ where: { name: s.name } });
    if (!existing) await db.site.create({ data: s });
  }

  const types = Object.fromEntries((await db.absenceType.findMany()).map((t) => [t.code, t.id]));
  const absences = [
    { shortName: "LFI", code: "BS", startDate: isoDate(1), endDate: isoDate(1) },
    { shortName: "DWO", code: "U", startDate: isoDate(0), endDate: isoDate(5) },
    { shortName: "LKL", code: "K", startDate: isoDate(0), endDate: isoDate(1) },
  ];
  if ((await db.absence.count()) === 0) {
    for (const a of absences) {
      await db.absence.create({ data: { employeeId: emp[a.shortName], typeId: types[a.code], startDate: a.startDate, endDate: a.endDate } });
    }
  }

  if (!opts.withLogins) return;
  // Test-Logins (nur Demo!): Passwort jeweils "Passwort123!"
  const pw = await hash("Passwort123!", { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const logins = [
    { username: "admin", role: "ADMIN", employeeId: null },
    { username: "einteiler", role: "PLANNER", employeeId: null },
    { username: "max", role: "EMPLOYEE", employeeId: emp.MMU },
    { username: "jonas", role: "EMPLOYEE", employeeId: emp.JWE },
  ];
  for (const l of logins) {
    await db.user.upsert({ where: { username: l.username }, update: {}, create: { ...l, passwordHash: pw } });
  }
}


/** Für Neuinstallationen ohne Demodaten: eine Abteilung, damit Mitarbeiter angelegt werden können */
export async function ensureDefaultDepartment(db: PrismaClient) {
  if ((await db.department.count()) === 0) {
    await db.department.create({ data: { name: "Allgemein", color: "#64748b", sortOrder: 0 } });
  }
}
