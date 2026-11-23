import { describe, expect, it } from "vitest";
import { normalizeStart, stepDay, visibleDays } from "@/lib/planning-days";
import { absenceOn, crewWarnings, siteWarnings, suggestSlot } from "@/lib/planning-logic";

describe("Sichtbare Tage", () => {
  // 2026-11-27 ist ein Freitag
  it("mit Wochenende: 3 aufeinanderfolgende Tage", () => {
    expect(visibleDays("2026-11-27", false)).toEqual(["2026-11-27", "2026-11-28", "2026-11-29"]);
  });
  it("ohne Wochenende: Fr, Mo, Di", () => {
    expect(visibleDays("2026-11-27", true)).toEqual(["2026-11-27", "2026-11-30", "2026-12-01"]);
  });
  it("Start am Samstag springt auf Montag", () => {
    expect(normalizeStart("2026-11-28", true)).toBe("2026-11-30");
    expect(normalizeStart("2026-11-28", false)).toBe("2026-11-28");
  });
  it("Blättern überspringt das Wochenende", () => {
    expect(stepDay("2026-11-27", 1, true)).toBe("2026-11-30");
    expect(stepDay("2026-11-30", -1, true)).toBe("2026-11-27");
    expect(stepDay("2026-11-27", 1, false)).toBe("2026-11-28");
  });
});

describe("Warnungen", () => {
  const geselle = { id: "g", firstName: "G", lastName: "G", qualification: "GESELLE" };
  const azubi = { id: "a", firstName: "A", lastName: "A", qualification: "AZUBI_1" };
  const azubi2 = { id: "b", firstName: "B", lastName: "B", qualification: "AZUBI_3" };
  it("Überbelegung", () => {
    expect(crewWarnings({ seats: 2 }, [geselle, azubi, azubi2], new Set(), true).map((w) => w.text)).toContain(
      "Überbelegt: 3 Personen bei 2 Sitzplätzen",
    );
  });
  it("nur Azubis", () => {
    expect(crewWarnings({ seats: 3 }, [azubi, azubi2], new Set(), true).some((w) => w.text.includes("Nur Azubis"))).toBe(true);
    expect(crewWarnings({ seats: 3 }, [azubi, geselle], new Set(), true).some((w) => w.text.includes("Nur Azubis"))).toBe(false);
  });
  it("abwesend eingeteilt", () => {
    expect(crewWarnings({ seats: 3 }, [geselle], new Set(["g"]), true)[0]).toEqual({ level: "error", text: "G G ist abwesend" });
  });
  it("keine Besatzung nur bei Baustelleneinsatz", () => {
    expect(crewWarnings({ seats: 3 }, [], new Set(), true)).toHaveLength(1);
    expect(crewWarnings({ seats: 3 }, [], new Set(), false)).toHaveLength(0);
  });
  it("Baustelle außerhalb des Zeitraums", () => {
    const s = { startDate: "2026-12-01", endDate: "2026-12-10", status: "ACTIVE", active: true };
    expect(siteWarnings(s, "2026-11-30")[0].text).toContain("beginnt erst");
    expect(siteWarnings(s, "2026-12-11")[0].text).toContain("endete");
    expect(siteWarnings(s, "2026-12-05")).toHaveLength(0);
  });
  it("Abwesenheit an einem Tag", () => {
    const abs = [{ employeeId: "x", startDate: "2026-12-01", endDate: "2026-12-03" }];
    expect(absenceOn(abs, "x", "2026-12-03")).toBeTruthy();
    expect(absenceOn(abs, "x", "2026-12-04")).toBeUndefined();
  });
});

describe("Zeitvorschlag", () => {
  it("Standardzeit, wenn frei", () => {
    expect(suggestSlot([], 420, 960)).toEqual({ startMin: 420, endMin: 960 });
  });
  it("nach dem bestehenden Einsatz", () => {
    expect(suggestSlot([{ startMin: 420, endMin: 720 }], 420, 960)).toEqual({ startMin: 720, endMin: 960 });
  });
  it("in die Lücke zwischen zwei Einsätzen", () => {
    expect(suggestSlot([{ startMin: 420, endMin: 600 }, { startMin: 780, endMin: 960 }], 420, 960)).toEqual({ startMin: 600, endMin: 780 });
  });
  it("nach Feierabend mindestens eine Stunde", () => {
    expect(suggestSlot([{ startMin: 420, endMin: 960 }], 420, 960)).toEqual({ startMin: 960, endMin: 1020 });
  });
  it("voller Tag -> null", () => {
    expect(suggestSlot([{ startMin: 0, endMin: 1440 }], 420, 960)).toBeNull();
  });
});

import { buildDay, buildIndexes } from "@/lib/planning-view";
import type { PlanningData } from "@/lib/planning-types";

describe("Tagesansicht aufbauen", () => {
  const emp = (id: string, q = "GESELLE") => ({ id, firstName: id, lastName: id, shortName: id.toUpperCase(), qualification: q, departmentId: "d", phone: null, active: true });
  const data: PlanningData = {
    from: "2026-12-01",
    to: "2026-12-01",
    employees: [emp("a"), emp("b", "AZUBI_1"), emp("c"), emp("u")],
    vehicles: [
      { id: "v1", licensePlate: "V1", name: "V1", type: null, seats: 2, active: true, sortOrder: 0, defaultIds: [] },
      { id: "v2", licensePlate: "V2", name: "V2", type: null, seats: 2, active: true, sortOrder: 1, defaultIds: [] },
      { id: "v3", licensePlate: "V3", name: "V3", type: null, seats: 2, active: true, sortOrder: 2, defaultIds: [] },
    ],
    sites: [{ id: "s1", name: "S1", address: null, customer: null, orderNumber: null, startDate: null, endDate: null, status: "ACTIVE", note: null, color: "#000000", active: true, adHoc: false }],
    departments: [{ id: "d", name: "D", color: "#111111", sortOrder: 0 }],
    absenceTypes: [{ id: "t", name: "Urlaub", code: "U", color: "#00ff00" }],
    absences: [{ id: "x", employeeId: "u", typeId: "t", startDate: "2026-11-30", endDate: "2026-12-02", note: null }],
    vehicleDays: [
      { id: "vd1", date: "2026-12-01", vehicleId: "v1", note: null, version: 1, crew: [{ id: "c1", employeeId: "a", sortOrder: 0 }], assignments: [{ id: "as1", siteId: "s1", startMin: 420, endMin: 960, note: null, version: 1 }] },
      { id: "vd2", date: "2026-12-01", vehicleId: "v2", note: null, version: 1, crew: [{ id: "c2", employeeId: "b", sortOrder: 0 }], assignments: [] },
    ],
    settings: { defaultStartMin: 420, defaultEndMin: 960 },
  };
  const day = buildDay(data, buildIndexes(data), "2026-12-01");
  it("Baustelle mit Einsatz", () => {
    expect(day.sites).toHaveLength(1);
    expect(day.sites[0].items[0].crew.map((e) => e.id)).toEqual(["a"]);
  });
  it("Pool: Fahrzeug mit Besatzung zuerst, dann freie", () => {
    expect(day.poolVehicles.map((v) => v.vehicle.id)).toEqual(["v2", "v3"]);
    expect(day.poolVehicles[0].crewWarnings.some((w) => w.text.includes("Nur Azubis"))).toBe(true);
  });
  it("Pool: verfügbare Mitarbeiter, abwesende ausgegraut am Ende", () => {
    expect(day.poolEmployees.map((p) => [p.employee.id, !!p.absence])).toEqual([["c", false], ["u", true]]);
    expect(day.absent.map((a) => a.type?.code)).toEqual(["U"]);
    expect(day.stats).toEqual({ assigned: 2, available: 1, absent: 1 });
  });
});
