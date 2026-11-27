import { describe, expect, it } from "vitest";
import { holidayName, isFirstWorkdayOfWeek, remainingWorkdaysOfWeek } from "@/lib/holidays";

describe("Feiertage Bayern", () => {
  it("bewegliche Feiertage 2026/2027", () => {
    expect(holidayName("2026-04-03")).toBe("Karfreitag");
    expect(holidayName("2026-04-06")).toBe("Ostermontag");
    expect(holidayName("2026-05-14")).toBe("Christi Himmelfahrt");
    expect(holidayName("2026-05-25")).toBe("Pfingstmontag");
    expect(holidayName("2026-06-04")).toBe("Fronleichnam");
    expect(holidayName("2027-03-26")).toBe("Karfreitag");
    expect(holidayName("2027-03-29")).toBe("Ostermontag");
  });
  it("feste Feiertage", () => {
    expect(holidayName("2027-01-06")).toBe("Heilige Drei Könige");
    expect(holidayName("2026-08-15")).toBe("Mariä Himmelfahrt");
    expect(holidayName("2026-11-01")).toBe("Allerheiligen");
    expect(holidayName("2026-11-18")).toBeNull(); // Buß- und Bettag ist kein gesetzlicher Feiertag
  });
  it("erster Arbeitstag der Woche", () => {
    expect(isFirstWorkdayOfWeek("2026-11-23")).toBe(true); // Montag
    expect(isFirstWorkdayOfWeek("2026-11-24")).toBe(false);
    expect(isFirstWorkdayOfWeek("2026-04-07")).toBe(true); // Dienstag nach Ostermontag
    expect(remainingWorkdaysOfWeek("2026-11-23")).toEqual(["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(remainingWorkdaysOfWeek("2026-05-11")).toEqual(["2026-05-12", "2026-05-13", "2026-05-15"]); // ohne Himmelfahrt
  });
});

import { groupByQualification } from "@/lib/constants";
describe("Gruppierung nach Qualifikation", () => {
  it("Meister, Gesellen, Azubis nach Lehrjahr, Praktikanten", () => {
    const items = ["PRAKTIKANT", "AZUBI_2", "GESELLE", "AZUBI_1", "MEISTER", "GESELLE"].map((q, i) => ({ q, i }));
    const g = groupByQualification(items, (x) => x.q);
    expect(g.map((x) => x.label)).toEqual(["Meister", "Gesellen", "Azubis 1. Lehrjahr", "Azubis 2. Lehrjahr", "Praktikanten"]);
    expect(g[1].items.map((x) => x.i)).toEqual([2, 5]);
  });
});

import { fixedConfirmText, fixedLabel } from "@/lib/planning-logic";
describe("Fester Termin", () => {
  it("Beschriftung mit und ohne Uhrzeit", () => {
    expect(fixedLabel({ fixed: false, fixedTimeMin: 540 })).toBeNull();
    expect(fixedLabel({ fixed: true, fixedTimeMin: 545 })).toBe("📌 Termin 09:05");
    expect(fixedLabel({ fixed: true, fixedTimeMin: null })).toBe("📌 Fester Termin");
    expect(fixedConfirmText({ fixed: true, fixedTimeMin: 540 }, "verschieben")).toContain("Termin 09:00");
    expect(fixedConfirmText({ fixed: false }, "verschieben")).toBeNull();
  });
});

import { workDaysText, worksOn } from "@/lib/constants";
describe("Arbeitstage", () => {
  it("4-Tage-Woche Mo–Do", () => {
    expect(worksOn({ workDays: "1234" }, "2026-11-26")).toBe(true); // Do
    expect(worksOn({ workDays: "1234" }, "2026-11-27")).toBe(false); // Fr
    expect(worksOn({ workDays: null }, "2026-11-28")).toBe(true);
    expect(workDaysText("1234")).toBe("Mo–Do");
    expect(workDaysText("1245")).toBe("Mo, Di, Do, Fr");
    expect(workDaysText(null)).toBe("alle Tage");
  });
});
