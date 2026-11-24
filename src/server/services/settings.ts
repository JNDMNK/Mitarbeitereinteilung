import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { formatMinutes } from "@/lib/time";
import type { cleanupSettingsSchema, settingsSchema } from "@/lib/validation";
import { audit } from "../audit";
import { publishChange } from "../events";
import { db } from "../db";
import { env } from "../env";
import { badRequest, conflict } from "../errors";

export const LOGO_MAX_BYTES = 1024 * 1024;

const LOGO_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;
type LogoExt = keyof typeof LOGO_TYPES;

export async function getSettings() {
  return db.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function updateSettings(actorId: string, input: z.infer<typeof settingsSchema>) {
  const result = await db.$transaction(async (tx) => {
    const current = await tx.appSettings.findUniqueOrThrow({ where: { id: 1 } });
    const res = await tx.appSettings.updateMany({
      where: { id: 1, version: input.version },
      data: {
        companyName: input.companyName,
        defaultStartMin: input.defaultStartMin,
        defaultEndMin: input.defaultEndMin,
        version: { increment: 1 },
      },
    });
    if (res.count !== 1) throw conflict();
    await audit(tx, {
      userId: actorId,
      action: "settings.update",
      entityType: "AppSettings",
      entityId: "1",
      summary: `Einstellungen geändert (Firma "${input.companyName}", Arbeitszeit ${formatMinutes(input.defaultStartMin)}–${formatMinutes(input.defaultEndMin)})`,
      details: {
        before: { companyName: current.companyName, start: current.defaultStartMin, end: current.defaultEndMin },
        after: { companyName: input.companyName, start: input.defaultStartMin, end: input.defaultEndMin },
      },
    });
    return tx.appSettings.findUniqueOrThrow({ where: { id: 1 } });
  });
  publishChange({ scope: "masterdata", userId: actorId });
  return result;
}

/** Dateityp anhand der ersten Bytes erkennen (nicht der Dateiendung trauen). SVG bewusst nicht erlaubt (Skripte). */
export function detectImageType(buf: Uint8Array): LogoExt | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf.length >= 12 &&
    String.fromCharCode(...buf.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...buf.slice(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

function uploadsDir() {
  return path.resolve(env().dataDir, "uploads");
}

function safeLogoPath(file: string): string | null {
  // Nur selbst erzeugte Dateinamen zulassen (kein Pfad-Traversal)
  if (!/^logo-[a-f0-9]{16}\.(png|jpg|webp)$/.test(file)) return null;
  return path.join(uploadsDir(), file);
}

export async function saveLogo(actorId: string, data: Uint8Array) {
  if (data.byteLength === 0) throw badRequest("Die Datei ist leer.");
  if (data.byteLength > LOGO_MAX_BYTES) throw badRequest("Das Logo darf höchstens 1 MB groß sein.");
  const ext = detectImageType(data);
  if (!ext) throw badRequest("Bitte ein Bild im Format PNG, JPG oder WebP hochladen.");

  await mkdir(uploadsDir(), { recursive: true });
  const file = `logo-${randomBytes(8).toString("hex")}.${ext}`;
  await writeFile(path.join(uploadsDir(), file), data);

  const old = await db.appSettings.findUniqueOrThrow({ where: { id: 1 } });
  await db.appSettings.update({ where: { id: 1 }, data: { logoFile: file, version: { increment: 1 } } });
  if (old.logoFile) {
    const p = safeLogoPath(old.logoFile);
    if (p) await unlink(p).catch(() => {});
  }
  await audit(db, { userId: actorId, action: "settings.logo", entityType: "AppSettings", entityId: "1", summary: "Firmenlogo hochgeladen" });
  return file;
}

export async function removeLogo(actorId: string) {
  const current = await db.appSettings.findUniqueOrThrow({ where: { id: 1 } });
  if (!current.logoFile) return;
  await db.appSettings.update({ where: { id: 1 }, data: { logoFile: null, version: { increment: 1 } } });
  const p = safeLogoPath(current.logoFile);
  if (p) await unlink(p).catch(() => {});
  await audit(db, { userId: actorId, action: "settings.logo", entityType: "AppSettings", entityId: "1", summary: "Firmenlogo entfernt" });
}

export async function readLogo(): Promise<{ data: Buffer; contentType: string; file: string } | null> {
  const s = await db.appSettings.findUnique({ where: { id: 1 }, select: { logoFile: true } });
  if (!s?.logoFile) return null;
  const p = safeLogoPath(s.logoFile);
  if (!p) return null;
  try {
    const data = await readFile(p);
    const ext = s.logoFile.split(".").pop() as LogoExt;
    return { data, contentType: LOGO_TYPES[ext], file: s.logoFile };
  } catch {
    return null;
  }
}

/** URL inkl. Dateiname als Cache-Schlüssel -> neues Logo = neue URL */
export function logoUrl(logoFile: string | null): string | null {
  return logoFile ? `/api/logo?v=${encodeURIComponent(logoFile)}` : null;
}

export async function updateCleanupSettings(actorId: string, input: z.infer<typeof cleanupSettingsSchema>) {
  const { version, ...data } = input;
  const result = await db.$transaction(async (tx) => {
    const res = await tx.appSettings.updateMany({ where: { id: 1, version }, data: { ...data, version: { increment: 1 } } });
    if (res.count !== 1) throw conflict();
    const txt = (d: number) => (d === 0 ? "aus" : `${d} Tage`);
    await audit(tx, {
      userId: actorId,
      action: "settings.update",
      entityType: "AppSettings",
      entityId: "1",
      summary: `Automatisches Löschen geändert (Baustellen ${txt(data.autoDeleteSiteDays)}, Mitarbeiter ${txt(data.autoDeleteEmployeeDays)}, Fahrzeuge/Räume ${txt(data.autoDeleteVehicleDays)})`,
    });
    return tx.appSettings.findUniqueOrThrow({ where: { id: 1 } });
  });
  publishChange({ scope: "masterdata", userId: actorId });
  return result;
}
