import { describe, expect, it } from "vitest";
import { cleanupSettingsSchema } from "@/lib/validation";

describe("cleanupSettingsSchema", () => {
  it("akzeptiert 0 (aus) bis 3650 Tage", () => {
    expect(cleanupSettingsSchema.safeParse({ version: 1, autoDeleteSiteDays: 0, autoDeleteEmployeeDays: 30, autoDeleteVehicleDays: 3650 }).success).toBe(true);
  });
  it("lehnt negative und gebrochene Werte ab", () => {
    expect(cleanupSettingsSchema.safeParse({ version: 1, autoDeleteSiteDays: -1, autoDeleteEmployeeDays: 30, autoDeleteVehicleDays: 30 }).success).toBe(false);
    expect(cleanupSettingsSchema.safeParse({ version: 1, autoDeleteSiteDays: 1.5, autoDeleteEmployeeDays: 30, autoDeleteVehicleDays: 30 }).success).toBe(false);
  });
});
