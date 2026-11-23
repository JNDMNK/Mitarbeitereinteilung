import { describe, expect, it } from "vitest";
import { applyDrag, collides, computeAxis, pxToMinutes, toPercent } from "@/lib/timeline";

describe("Zeitachse", () => {
  it("Standardbereich 05–20 Uhr", () => {
    expect(computeAxis([], 420, 960)).toEqual({ startMin: 300, endMin: 1200 });
  });
  it("erweitert auf volle Stunden um frühe/späte Einsätze", () => {
    expect(computeAxis([{ startMin: 255, endMin: 600 }, { startMin: 1100, endMin: 1275 }], 420, 960)).toEqual({ startMin: 240, endMin: 1320 });
  });
  it("Prozentposition", () => {
    expect(toPercent(750, { startMin: 300, endMin: 1200 })).toBe(50);
  });
});

describe("Ziehen im 15-Minuten-Raster", () => {
  const ppm = 2; // 2 px pro Minute
  it("rundet auf 15 Minuten", () => {
    expect(pxToMinutes(14, ppm)).toBe(0);
    expect(pxToMinutes(16, ppm)).toBe(15);
    expect(pxToMinutes(-50, ppm)).toBe(-30);
  });
  it("Verschieben behält die Dauer und bleibt im Tag", () => {
    expect(applyDrag({ startMin: 420, endMin: 960 }, "move", 60)).toEqual({ startMin: 480, endMin: 1020 });
    expect(applyDrag({ startMin: 420, endMin: 960 }, "move", -600)).toEqual({ startMin: 0, endMin: 540 });
    expect(applyDrag({ startMin: 420, endMin: 960 }, "move", 900)).toEqual({ startMin: 900, endMin: 1440 });
  });
  it("Ränder ändern, Mindestdauer 15 Minuten", () => {
    expect(applyDrag({ startMin: 420, endMin: 960 }, "start", 30)).toEqual({ startMin: 450, endMin: 960 });
    expect(applyDrag({ startMin: 420, endMin: 960 }, "start", 600)).toEqual({ startMin: 945, endMin: 960 });
    expect(applyDrag({ startMin: 420, endMin: 960 }, "end", -600)).toEqual({ startMin: 420, endMin: 435 });
    expect(applyDrag({ startMin: 420, endMin: 960 }, "end", 600)).toEqual({ startMin: 420, endMin: 1440 });
  });
  it("erkennt Kollision mit anderem Einsatz, nicht mit sich selbst", () => {
    const row = [
      { id: "a", startMin: 420, endMin: 720 },
      { id: "b", startMin: 735, endMin: 960 },
    ];
    expect(collides(row, "a", { startMin: 420, endMin: 735 })).toBeUndefined();
    expect(collides(row, "a", { startMin: 420, endMin: 750 })?.id).toBe("b");
  });
});
