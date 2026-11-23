import { describe, expect, it } from "vitest";
import { formatMinutes, gridOptions, isOnGrid, overlaps, parseTime, snapToGrid } from "@/lib/time";
import { settingsSchema } from "@/lib/validation";
import { detectImageType } from "@/server/services/settings";

describe("15-Minuten-Raster", () => {
  it("formatiert und parst", () => {
    expect(formatMinutes(420)).toBe("07:00");
    expect(formatMinutes(975)).toBe("16:15");
    expect(parseTime("7:15")).toBe(435);
    expect(parseTime("24:00")).toBe(1440);
    expect(parseTime("24:15")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
  it("prüft und rundet aufs Raster", () => {
    expect(isOnGrid(435)).toBe(true);
    expect(isOnGrid(440)).toBe(false);
    expect(snapToGrid(442)).toBe(435);
    expect(snapToGrid(443)).toBe(450);
    expect(gridOptions(420, 480)).toEqual([420, 435, 450, 465, 480]);
  });
  it("erkennt Überschneidungen (Ende = Beginn ist erlaubt)", () => {
    expect(overlaps(420, 600, 540, 720)).toBe(true);
    expect(overlaps(420, 600, 600, 720)).toBe(false);
  });
});

describe("Einstellungen", () => {
  it("Ende muss nach Beginn liegen und im Raster sein", () => {
    expect(settingsSchema.safeParse({ version: 1, companyName: "X", defaultStartMin: 420, defaultEndMin: 960 }).success).toBe(true);
    expect(settingsSchema.safeParse({ version: 1, companyName: "X", defaultStartMin: 960, defaultEndMin: 420 }).success).toBe(false);
    expect(settingsSchema.safeParse({ version: 1, companyName: "X", defaultStartMin: 425, defaultEndMin: 960 }).success).toBe(false);
  });
});

describe("Logo-Dateityp", () => {
  it("erkennt PNG/JPG/WebP an den Bytes, lehnt SVG ab", () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(detectImageType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("webp");
    expect(detectImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
  });
});

import { addDays, formatDayShort, isWeekend, weekday } from "@/lib/dates";
import { employeeCreateSchema, siteCreateSchema, vehicleCreateSchema } from "@/lib/masterdata-schemas";

describe("Datumshelfer", () => {
  it("rechnet über Monats- und Sommerzeitgrenzen", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("erkennt Wochentage", () => {
    expect(weekday("2026-11-23")).toBe(1);
    expect(isWeekend("2026-11-28")).toBe(true);
    expect(formatDayShort("2026-11-23")).toBe("Mo, 23.11.");
  });
});

describe("Stammdaten-Validierung", () => {
  const dep = "dep1";
  it("Mitarbeiter: Kürzel wird großgeschrieben", () => {
    const r = employeeCreateSchema.parse({ firstName: "Max", lastName: "Müller", shortName: "mmu", qualification: "GESELLE", departmentId: dep });
    expect(r.shortName).toBe("MMU");
    expect(r.phone).toBeNull();
  });
  it("Fahrzeug: Fahrer nicht zusätzlich Mitfahrer", () => {
    const base = { licensePlate: "wü-ab 1", name: "X", seats: 3 };
    expect(vehicleCreateSchema.safeParse({ ...base, defaultDriverId: "a", defaultMemberIds: ["a"] }).success).toBe(false);
    expect(vehicleCreateSchema.parse({ ...base, defaultDriverId: "a", defaultMemberIds: ["b"] }).licensePlate).toBe("WÜ-AB 1");
  });
  it("Baustelle: Ende nicht vor Beginn, leere Daten erlaubt", () => {
    expect(siteCreateSchema.safeParse({ name: "X", color: "#112233", startDate: "2026-02-01", endDate: "2026-01-01" }).success).toBe(false);
    expect(siteCreateSchema.parse({ name: "X", color: "#112233", startDate: "", endDate: "" }).startDate).toBeNull();
  });
});

import { addMonths, diffDays, eachDay, formatRange, monthEnd, monthStart } from "@/lib/dates";

describe("Monats- und Bereichshelfer", () => {
  it("Monatsgrenzen inkl. Schaltjahr", () => {
    expect(monthStart("2026-11-23")).toBe("2026-11-01");
    expect(monthEnd("2026-11-23")).toBe("2026-11-30");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
  });
  it("Tage aufzählen und zählen", () => {
    expect(eachDay("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
  });
  it("Zeiträume lesbar formatieren", () => {
    expect(formatRange("2026-12-01", "2026-12-05")).toBe("01.12.–05.12.2026");
    expect(formatRange("2026-12-28", "2027-01-02")).toBe("28.12.2026–02.01.2027");
    expect(formatRange("2026-12-01", "2026-12-01")).toBe("01.12.2026");
  });
});
