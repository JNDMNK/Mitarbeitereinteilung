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
