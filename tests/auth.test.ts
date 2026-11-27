import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/server/auth/rate-limit";
import { checkCsrfToken, checkOrigin } from "@/server/csrf";
import { clientIp } from "@/server/request";
import { can, homePathFor } from "@/lib/roles";
import { changePasswordSchema, createUserSchema, usernameSchema } from "@/lib/validation";

const ORIGIN = "https://einteilung.example.de";
const h = (init: Record<string, string>) => new Headers(init);

describe("Rechte", () => {
  it("Mitarbeiter darf nur lesen", () => {
    expect(can("EMPLOYEE", "planning.view")).toBe(true);
    expect(can("EMPLOYEE", "absences.view")).toBe(true);
    expect(can("EMPLOYEE", "planning.edit")).toBe(false);
    expect(can("EMPLOYEE", "masterdata.edit")).toBe(false);
    expect(can("EMPLOYEE", "audit.view")).toBe(false);
  });
  it("Einteiler bearbeitet Planung, aber keine Benutzer/Abteilungen", () => {
    expect(can("PLANNER", "planning.edit")).toBe(true);
    expect(can("PLANNER", "absences.edit")).toBe(true);
    expect(can("PLANNER", "admin.users")).toBe(false);
    expect(can("PLANNER", "admin.masterdata")).toBe(false);
  });
  it("Admin darf alles", () => {
    expect(can("ADMIN", "admin.users")).toBe(true);
    expect(can("ADMIN", "admin.backup")).toBe(true);
  });
  it("ohne Rolle nichts", () => {
    expect(can(null, "planning.view")).toBe(false);
  });
  it("Startseite je Rolle", () => {
    expect(homePathFor("EMPLOYEE")).toBe("/meine-einteilung");
    expect(homePathFor("PLANNER")).toBe("/planung");
  });
});

describe("CSRF / Origin", () => {
  it("akzeptiert eigene Origin", () => {
    expect(() => checkOrigin(h({ origin: ORIGIN }), ORIGIN)).not.toThrow();
  });
  it("lehnt fremde Origin ab", () => {
    expect(() => checkOrigin(h({ origin: "https://evil.example" }), ORIGIN)).toThrow();
  });
  it("prüft Referer, wenn Origin fehlt", () => {
    expect(() => checkOrigin(h({ referer: `${ORIGIN}/planung` }), ORIGIN)).not.toThrow();
    expect(() => checkOrigin(h({ referer: "https://evil.example/x" }), ORIGIN)).toThrow();
  });
  it("lehnt Anfragen ohne Herkunftsangabe ab", () => {
    expect(() => checkOrigin(h({}), ORIGIN)).toThrow();
    expect(() => checkOrigin(h({ "sec-fetch-site": "same-origin" }), ORIGIN)).not.toThrow();
  });
  it("prüft das Token", () => {
    const eq = (a: string, b: string) => a === b;
    expect(() => checkCsrfToken(h({ "x-csrf-token": "abc" }), "abc", eq)).not.toThrow();
    expect(() => checkCsrfToken(h({ "x-csrf-token": "xyz" }), "abc", eq)).toThrow();
    expect(() => checkCsrfToken(h({}), "abc", eq)).toThrow();
  });
});

describe("Client-IP hinter Proxy", () => {
  it("ignoriert X-Forwarded-For ohne TRUST_PROXY", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }), 0)).toBe("unbekannt");
  });
  it("nimmt bei einem Hop den rechten Eintrag (nicht fälschbar)", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }), 1)).toBe("1.2.3.4");
  });
  it("berücksichtigt mehrere Hops", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.2" }), 2)).toBe("1.2.3.4");
  });
});

describe("Rate-Limit", () => {
  it("sperrt nach Limit und gibt nach Zeitfenster frei", () => {
    const rl = new RateLimiter(3, 1000);
    expect(rl.hit("a", 0).ok).toBe(true);
    expect(rl.hit("a", 10).ok).toBe(true);
    expect(rl.hit("a", 20).ok).toBe(true);
    const blocked = rl.hit("a", 30);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(970);
    expect(rl.hit("b", 30).ok).toBe(true);
    expect(rl.hit("a", 1001).ok).toBe(true);
  });
});

describe("Validierung", () => {
  it("Passwort-Mindestlänge", () => {
    const r = createUserSchema.safeParse({ username: "test", password: "kurz", role: "ADMIN" });
    expect(r.success).toBe(false);
    expect(createUserSchema.safeParse({ username: "test", password: "1234567", role: "ADMIN" }).success).toBe(false);
    expect(createUserSchema.safeParse({ username: "test", password: "12345678", role: "ADMIN" }).success).toBe(true);
  });
  it("Benutzername wird normalisiert", () => {
    expect(usernameSchema.parse("  Max.Muster ")).toBe("max.muster");
    expect(usernameSchema.safeParse("max muster").success).toBe(false);
  });
  it("neues Passwort muss sich unterscheiden", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "Passwort123!", newPassword: "Passwort123!" }).success).toBe(false);
  });
});

describe("Rate-Limit check()", () => {
  it("zählt nicht mit", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 0).ok).toBe(true);
    rl.hit("a", 0);
    expect(rl.check("a", 10).ok).toBe(false);
  });
});
