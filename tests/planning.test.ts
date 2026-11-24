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
  const emp = (id: string, q = "GESELLE") => ({ id, firstName: id, lastName: id, shortName: id.toUpperCase(), qualification: q, departmentId: "d", phone: null, active: true, availableFrom: null, availableUntil: null });
  const data: PlanningData = {
    from: "2026-12-01",
    to: "2026-12-01",
    employees: [emp("a"), emp("b", "AZUBI_1"), emp("c"), emp("u")],
    vehicles: [
      { id: "v1", kind: "VEHICLE", licensePlate: "V1", name: "V1", type: null, seats: 2, active: true, sortOrder: 0, ownerId: "c", departmentId: null, defaultIds: ["c"] },
      { id: "v2", kind: "VEHICLE", licensePlate: "V2", name: "V2", type: null, seats: 2, active: true, sortOrder: 1, ownerId: null, departmentId: null, defaultIds: [] },
      { id: "v3", kind: "VEHICLE", licensePlate: "V3", name: "V3", type: null, seats: 2, active: true, sortOrder: 2, ownerId: "a", departmentId: null, defaultIds: ["a", "b"] },
      { id: "v4", kind: "VEHICLE", licensePlate: "V4", name: "V4", type: null, seats: 2, active: true, sortOrder: 3, ownerId: "u", departmentId: null, defaultIds: ["u"] },
    ],
    sites: [{ id: "s1", name: "S1", address: null, customer: null, orderNumber: null, startDate: null, endDate: null, status: "ACTIVE", note: null, color: "#000000", active: true, adHoc: false }],
    departments: [{ id: "d", name: "D", color: "#111111", sortOrder: 0 }],
    absenceTypes: [{ id: "t", name: "Urlaub", code: "U", color: "#00ff00" }],
    absences: [{ id: "x", employeeId: "u", typeId: "t", startDate: "2026-11-30", endDate: "2026-12-02", note: null, withVehicle: true }],
    vehicleDays: [
      { id: "vd1", date: "2026-12-01", vehicleId: "v1", note: null, version: 1, crew: [{ id: "c1", employeeId: "a", sortOrder: 0, assignedById: null, createdAt: "" }], assignments: [{ id: "as1", siteId: "s1", startMin: 420, endMin: 960, note: null, version: 1, updatedById: null, updatedAt: "" }] },
      { id: "vd2", date: "2026-12-01", vehicleId: "v2", note: null, version: 1, crew: [{ id: "c2", employeeId: "b", sortOrder: 0, assignedById: null, createdAt: "" }], assignments: [] },
    ],
    planners: [],
    settings: { defaultStartMin: 420, defaultEndMin: 960 },
  };
  const day = buildDay(data, buildIndexes(data), "2026-12-01");
  it("Baustelle mit Einsatz", () => {
    expect(day.sites).toHaveLength(1);
    expect(day.sites[0].items[0].crew.map((e) => e.id)).toEqual(["a"]);
  });
  it("Pool: feste Reihenfolge laut Stammdaten (Besatzung ändert nichts), gesperrte ans Ende", () => {
    expect(day.poolVehicles.map((v) => v.vehicle.id)).toEqual(["v2", "v3", "v4"]);
    expect(day.poolVehicles[0].crewWarnings.some((w) => w.text.includes("Nur Azubis"))).toBe(true);
  });
  it("Besitzer mit Tagesstatus und Standard-Mitfahrer", () => {
    const v1 = day.sites[0].items[0];
    expect(v1.owner?.employee.id).toBe("c");
    expect(v1.owner?.state).toBe("free");
    const v3 = day.poolVehicles.find((p) => p.vehicle.id === "v3")!;
    expect(v3.owner?.state).toBe("elsewhere");
    expect(v3.owner?.elsewhereVehicle?.id).toBe("v1");
    expect(v3.defaultMembers.map((e) => e.id)).toEqual(["b"]);
  });
  it("Fahrzeug gesperrt, wenn Besitzer mit Fahrzeug abwesend", () => {
    const v4 = day.poolVehicles.find((p) => p.vehicle.id === "v4")!;
    expect(v4.unavailable?.type?.code).toBe("U");
    expect(v4.owner?.state).toBe("absent");
  });
  it("Pool: nur verfügbare Mitarbeiter, Abwesende nur in der Abwesenheitsleiste", () => {
    expect(day.poolEmployees.map((p) => p.employee.id)).toEqual(["c"]);
    expect(day.absent.map((a) => a.type?.code)).toEqual(["U"]);
    expect(day.stats).toEqual({ assigned: 2, available: 1, absent: 1 });
  });
});

import { userInitials } from "@/lib/initials";
describe("Kürzel für 'eingeteilt von'", () => {
  it("eigenes Kürzel vor Mitarbeiter-Kürzel vor Benutzername", () => {
    expect(userInitials({ username: "x", initials: "jn", employee: { shortName: "MMU" } })).toBe("JN");
    expect(userInitials({ username: "max", employee: { shortName: "MMU" } })).toBe("MMU");
    expect(userInitials({ username: "stefan.schmidt" })).toBe("SSC");
    expect(userInitials({ username: "einteiler" })).toBe("EIN");
  });
});

import { filterDayByDepartments, vehicleDepartment } from "@/lib/planning-view";

describe("Abteilungen ausblenden", () => {
  const emp = (id: string, dep: string) => ({ id, firstName: id, lastName: id, shortName: id.toUpperCase(), qualification: "GESELLE", departmentId: dep, phone: null, active: true, availableFrom: null, availableUntil: null });
  const veh = (id: string, ownerId: string | null, departmentId: string | null = null) => ({
    id, kind: "VEHICLE", licensePlate: id, name: id, type: null, seats: 3, active: true, sortOrder: 0, ownerId, departmentId, defaultIds: ownerId ? [ownerId] : [],
  });
  const data: PlanningData = {
    from: "2026-12-01",
    to: "2026-12-01",
    employees: [emp("e1", "elektro"), emp("e2", "elektro"), emp("s1", "sanitaer"), emp("s2", "sanitaer"), emp("h1", "heizung")],
    vehicles: [veh("ve", "e1"), veh("vs", "s1"), veh("vh", "h1", "sanitaer"), veh("vx", null)],
    sites: [{ id: "site", name: "S", address: null, customer: null, orderNumber: null, startDate: null, endDate: null, status: "ACTIVE", note: null, color: "#000000", active: true, adHoc: false }],
    departments: [
      { id: "elektro", name: "Elektro", color: "#111111", sortOrder: 0 },
      { id: "sanitaer", name: "Sanitär", color: "#222222", sortOrder: 1 },
      { id: "heizung", name: "Heizung", color: "#333333", sortOrder: 2 },
    ],
    absenceTypes: [{ id: "t", name: "Urlaub", code: "U", color: "#00ff00" }],
    absences: [{ id: "a", employeeId: "s2", typeId: "t", startDate: "2026-12-01", endDate: "2026-12-01", note: null, withVehicle: false }],
    vehicleDays: [
      // Sanitär-Fahrzeug, aber mit Elektriker besetzt -> bleibt sichtbar
      { id: "d1", date: "2026-12-01", vehicleId: "vs", note: null, version: 1, crew: [{ id: "c1", employeeId: "e2", sortOrder: 0, assignedById: null, createdAt: "" }], assignments: [{ id: "x1", siteId: "site", startMin: 420, endMin: 960, note: null, version: 1, updatedById: null, updatedAt: "" }] },
    ],
    planners: [],
    settings: { defaultStartMin: 420, defaultEndMin: 960 },
  };
  const idx = buildIndexes(data);
  const day = buildDay(data, idx, "2026-12-01");

  it("Fahrzeug-Abteilung: eigene vor Besitzer, sonst keine", () => {
    expect(vehicleDepartment(idx, data.vehicles[0])).toBe("elektro");
    expect(vehicleDepartment(idx, data.vehicles[2])).toBe("sanitaer");
    expect(vehicleDepartment(idx, data.vehicles[3])).toBeNull();
  });
  it("ohne Auswahl unverändert", () => {
    expect(filterDayByDepartments(day, idx, new Set())).toBe(day);
  });
  it("Sanitär ausblenden: Mitarbeiter, Abwesende und Fahrzeuge weg, gemischte Besatzung bleibt", () => {
    const f = filterDayByDepartments(day, idx, new Set(["sanitaer"]));
    expect(f.poolEmployees.map((p) => p.employee.id).sort()).toEqual(["e1", "h1"]);
    expect(f.absent).toHaveLength(0);
    expect(f.poolVehicles.map((p) => p.vehicle.id).sort()).toEqual(["ve", "vx"]); // vh (Abteilung Sanitär) weg, vx ohne Abteilung bleibt
    expect(f.sites[0].items.map((i) => i.vehicle.id)).toEqual(["vs"]); // mit Elektriker besetzt
    expect(f.hidden).toMatchObject({ employees: 2, vehicles: 1 });
  });
  it("Elektro ausblenden: Elektro-Fahrzeug weg, Sanitär-Fahrzeug (sichtbare Abteilung) bleibt", () => {
    const f = filterDayByDepartments(day, idx, new Set(["elektro"]));
    expect(f.sites[0].items.map((i) => i.vehicle.id)).toEqual(["vs"]);
    expect(f.poolEmployees.map((p) => p.employee.id).sort()).toEqual(["h1", "s1"]);
    expect(f.poolVehicles.map((p) => p.vehicle.id).sort()).toEqual(["vh", "vx"]);
  });
});

import { isAvailableOn } from "@/lib/constants";
describe("Praktikanten / Zeitraum im Betrieb", () => {
  it("Zeitraum prüfen", () => {
    expect(isAvailableOn({ availableFrom: "2026-12-01", availableUntil: "2026-12-19" }, "2026-12-01")).toBe(true);
    expect(isAvailableOn({ availableFrom: "2026-12-01", availableUntil: "2026-12-19" }, "2026-11-30")).toBe(false);
    expect(isAvailableOn({ availableFrom: null, availableUntil: "2026-12-19" }, "2026-12-20")).toBe(false);
    expect(isAvailableOn({ availableFrom: null, availableUntil: null }, "2030-01-01")).toBe(true);
  });
  const emp = (id: string, extra = {}) => ({ id, firstName: id, lastName: id, shortName: id.toUpperCase(), qualification: "GESELLE", departmentId: "d", phone: null, active: true, availableFrom: null, availableUntil: null, ...extra });
  const data: PlanningData = {
    from: "2026-11-30",
    to: "2026-11-30",
    employees: [emp("g"), emp("p", { qualification: "PRAKTIKANT", availableFrom: "2026-12-01", availableUntil: "2026-12-19" })],
    vehicles: [
      { id: "v9", kind: "VEHICLE", licensePlate: "V9", name: "V9", type: null, seats: 3, active: true, sortOrder: 9, ownerId: null, departmentId: null, defaultIds: [] },
      { id: "v1", kind: "VEHICLE", licensePlate: "V1", name: "V1", type: null, seats: 3, active: true, sortOrder: 1, ownerId: null, departmentId: null, defaultIds: [] },
    ],
    sites: [],
    departments: [{ id: "d", name: "D", color: "#111111", sortOrder: 0 }],
    absenceTypes: [],
    absences: [],
    vehicleDays: [{ id: "x", date: "2026-11-30", vehicleId: "v9", note: null, version: 1, crew: [{ id: "c", employeeId: "g", sortOrder: 0, assignedById: null, createdAt: "" }], assignments: [] }],
    planners: [],
    settings: { defaultStartMin: 420, defaultEndMin: 960 },
  };
  const idx = buildIndexes(data);
  it("vor dem Praktikum nicht im Pool", () => {
    expect(buildDay(data, idx, "2026-11-30").poolEmployees.map((p) => p.employee.id)).toEqual([]);
    expect(buildDay(data, idx, "2026-12-01").poolEmployees.map((p) => p.employee.id)).toEqual(["g", "p"]);
  });
  it("besetztes Fahrzeug springt nicht nach oben", () => {
    expect(buildDay(data, idx, "2026-11-30").poolVehicles.map((p) => p.vehicle.id)).toEqual(["v1", "v9"]);
  });
  it("nur Praktikant + Azubi -> Warnung", () => {
    expect(crewWarnings({ seats: 3 }, [{ id: "p", firstName: "P", lastName: "P", qualification: "PRAKTIKANT" }], new Set(), true)[0].text).toBe(
      "Nur Azubis/Praktikanten – kein Geselle/Meister",
    );
  });
});

import { compactNames } from "@/lib/names";
describe("Kompakte Namen", () => {
  it("Nachname + Initiale, bei Gleichheit eindeutig", () => {
    const m = compactNames([
      { id: "1", firstName: "Max", lastName: "Müller" },
      { id: "2", firstName: "Moritz", lastName: "Müller" },
      { id: "3", firstName: "Jonas", lastName: "Weber" },
      { id: "4", firstName: "Anna", lastName: "Schmidt" },
      { id: "5", firstName: "Ann", lastName: "Schmidt" },
    ]);
    expect(m.get("3")).toBe("Weber J.");
    expect(m.get("1")).toBe("Müller Ma.");
    expect(m.get("2")).toBe("Müller Mo.");
    expect(m.get("5")).toBe("Schmidt Ann");
    expect(m.get("4")).toBe("Schmidt Anna");
  });
});

describe("Kartenansicht: Fahrzeug-Reihenfolge", () => {
  const emp = { id: "e", firstName: "E", lastName: "E", shortName: "E", qualification: "GESELLE", departmentId: "d", phone: null, active: true, availableFrom: null, availableUntil: null };
  const veh = (id: string, sortOrder: number) => ({ id, kind: "VEHICLE", licensePlate: id, name: id, type: null, seats: 3, active: true, sortOrder, ownerId: null, departmentId: null, defaultIds: [] });
  const site = (id: string) => ({ id, name: id, address: null, customer: null, orderNumber: null, startDate: null, endDate: null, status: "ACTIVE", note: null, color: "#000000", active: true, adHoc: false });
  const asg = (id: string, siteId: string, startMin: number) => ({ id, siteId, startMin, endMin: startMin + 60, note: null, version: 1, updatedById: null, updatedAt: "" });
  const vd = (vehicleId: string, assignments: ReturnType<typeof asg>[]) => ({ id: `vd-${vehicleId}`, date: "2026-12-01", vehicleId, note: null, version: 1, crew: [], assignments });
  const data: PlanningData = {
    from: "2026-12-01",
    to: "2026-12-01",
    employees: [emp],
    vehicles: [veh("v1", 1), veh("v2", 2), veh("v3", 3)],
    sites: [site("A"), site("B")],
    departments: [{ id: "d", name: "D", color: "#111111", sortOrder: 0 }],
    absenceTypes: [],
    absences: [],
    // v3 früh auf A, v1 spät auf B, v2 mittags auf A
    vehicleDays: [vd("v3", [asg("a3", "A", 420)]), vd("v1", [asg("a1", "B", 900)]), vd("v2", [asg("a2", "A", 720)])],
    planners: [],
    settings: { defaultStartMin: 420, defaultEndMin: 960 },
  };
  const day = buildDay(data, buildIndexes(data), "2026-12-01");
  it("Baustellen nach ihrem ersten Fahrzeug, darin Fahrzeuge in Stammdaten-Reihenfolge", () => {
    expect(day.sites.map((g) => g.site.id)).toEqual(["B", "A"]);
    expect(day.sites[1].items.map((i) => i.vehicle.id)).toEqual(["v2", "v3"]);
  });
});

describe("Räume", () => {
  const emp = (id: string, q = "AZUBI_1") => ({ id, firstName: id, lastName: id, shortName: id.toUpperCase(), qualification: q, departmentId: "d", phone: null, active: true, availableFrom: null, availableUntil: null });
  const data: PlanningData = {
    from: "2026-12-01",
    to: "2026-12-01",
    employees: [emp("a"), emp("b")],
    vehicles: [
      { id: "lager", kind: "ROOM", licensePlate: "LAGER", name: "Lager", type: null, seats: 10, active: true, sortOrder: 50, ownerId: null, departmentId: null, defaultIds: [] },
      { id: "v1", kind: "VEHICLE", licensePlate: "V1", name: "V1", type: null, seats: 3, active: true, sortOrder: 1, ownerId: null, departmentId: null, defaultIds: [] },
    ],
    sites: [],
    departments: [{ id: "d", name: "D", color: "#111111", sortOrder: 0 }],
    absenceTypes: [],
    absences: [],
    vehicleDays: [{ id: "x", date: "2026-12-01", vehicleId: "lager", note: null, version: 1, crew: [{ id: "c", employeeId: "a", sortOrder: 0, assignedById: null, createdAt: "" }], assignments: [] }],
    planners: [],
    settings: { defaultStartMin: 420, defaultEndMin: 960 },
  };
  const day = buildDay(data, buildIndexes(data), "2026-12-01");
  it("eigener Abschnitt, nicht bei den Fahrzeugen", () => {
    expect(day.rooms.map((r) => r.vehicle.id)).toEqual(["lager"]);
    expect(day.poolVehicles.map((p) => p.vehicle.id)).toEqual(["v1"]);
  });
  it("Azubi allein im Raum ist keine Warnung, zählt aber als eingeteilt", () => {
    expect(day.rooms[0].crewWarnings).toEqual([]);
    expect(day.poolEmployees.map((p) => p.employee.id)).toEqual(["b"]);
  });
});
