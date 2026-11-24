import { describe, expect, it } from "vitest";
import { isoWeek, weekLabel } from "@/lib/dates";

describe("isoWeek", () => {
  it("berechnet ISO-Kalenderwochen inkl. Jahreswechsel", () => {
    expect(isoWeek("2026-11-24")).toBe(48);
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
    expect(isoWeek("2024-12-30")).toBe(1);
    expect(isoWeek("2021-01-03")).toBe(53);
  });
  it("formatiert Bereiche", () => {
    expect(weekLabel("2026-11-24")).toBe("KW 48");
    expect(weekLabel("2026-11-27", "2026-11-30")).toBe("KW 48–49");
  });
});
