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
