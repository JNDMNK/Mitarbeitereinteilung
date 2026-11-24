import "server-only";
import type { z } from "zod";
import { SITE_STATUS_LABELS, type SiteStatus } from "@/lib/constants";
import type { siteCreateSchema, siteUpdateSchema } from "@/lib/masterdata-schemas";
import type { Role } from "@/lib/roles";
import { audit } from "../../audit";
import { publishChange } from "../../events";
import { db } from "../../db";
import { badRequest, conflict, forbidden, notFound } from "../../errors";
import { deactivation, describeChanges, summaryWith } from "./changes";

export function listSites() {
  return db.site.findMany({
    orderBy: [{ active: "desc" }, { status: "asc" }, { name: "asc" }],
  });
}

const fmtDate = (v: unknown) => (typeof v === "string" && v ? v.split("-").reverse().join(".") : "–");

export async function createSite(actorId: string, input: z.infer<typeof siteCreateSchema>) {
  const result = await db.$transaction(async (tx) => {
    const s = await tx.site.create({ data: input });
    await audit(tx, { userId: actorId, action: "site.create", entityType: "Site", entityId: s.id, summary: `Baustelle "${s.name}" angelegt` });
    return s;
  });
  publishChange({ scope: "masterdata", userId: actorId });
  return result;
}

export async function updateSite(actorId: string, id: string, input: z.infer<typeof siteUpdateSchema>) {
  const { version, ...data } = input;
  const result = await db.$transaction(async (tx) => {
    const cur = await tx.site.findUnique({ where: { id } });
    if (!cur) throw notFound("Baustelle nicht gefunden.");
    const start = data.startDate === undefined ? cur.startDate : data.startDate;
    const end = data.endDate === undefined ? cur.endDate : data.endDate;
    if (start && end && start > end) throw badRequest("Das Ende darf nicht vor dem Beginn liegen.");

    const res = await tx.site.updateMany({ where: { id, version }, data: { ...data, ...deactivation(cur.active, data.active), version: { increment: 1 } } });
    if (res.count !== 1) throw conflict();
    const changes = describeChanges(
      cur,
      data,
      { name: "Name", address: "Adresse", customer: "Kunde", orderNumber: "Auftragsnr.", startDate: "Beginn", endDate: "Ende", status: "Status", note: "Notiz", color: "Farbe", active: "Aktiv", adHoc: "Freier Eintrag" },
      (key, v) =>
        key === "startDate" || key === "endDate"
          ? fmtDate(v)
          : key === "status"
            ? (SITE_STATUS_LABELS[v as SiteStatus] ?? String(v))
            : v === null || v === undefined || v === ""
              ? "–"
              : String(v),
    );
    await audit(tx, { userId: actorId, action: "site.update", entityType: "Site", entityId: id, summary: summaryWith(`Baustelle "${cur.name}" geändert`, changes) });
    return tx.site.findUniqueOrThrow({ where: { id } });
  });
  publishChange({ scope: "masterdata", userId: actorId });
  return result;
}

/**
 * Baustelle endgültig löschen (nur wenn deaktiviert) – inkl. aller Einsätze darauf.
 * Freie Einträge dürfen Einteiler und Admins löschen, feste Baustellen nur Admins.
 */
export async function deleteSite(actor: { id: string | null; role: Role }, id: string, version: number | null, reason?: string) {
  const result = await db.$transaction(async (tx) => {
    const s = await tx.site.findUnique({ where: { id } });
    if (!s) throw notFound("Baustelle nicht gefunden.");
    if (version !== null && s.version !== version) throw conflict();
    const label = s.adHoc ? `Freier Eintrag „${s.name}“` : `Baustelle „${s.name}“`;
    if (!s.adHoc && actor.role !== "ADMIN") throw forbidden("Feste Baustellen kann nur ein Admin endgültig löschen.");
    if (s.active) throw badRequest(`${label} ist noch aktiv. Bitte zuerst deaktivieren, dann löschen.`);
    const assignments = await tx.siteAssignment.findMany({ where: { siteId: id }, select: { vehicleDay: { select: { date: true } } } });
    await tx.siteAssignment.deleteMany({ where: { siteId: id } });
    await tx.site.delete({ where: { id } });
    await audit(tx, {
      userId: actor.id,
      action: "site.delete",
      entityType: "Site",
      entityId: id,
      summary: `${label} endgültig gelöscht${reason ? ` (${reason})` : ""} – ${assignments.length} Einsatz/Einsätze entfernt`,
    });
    return { label, count: assignments.length, dates: [...new Set(assignments.map((a) => a.vehicleDay.date))] };
  });
  publishChange({ scope: "masterdata", userId: actor.id ?? "system" });
  if (result.dates.length) publishChange({ scope: "planning", dates: result.dates, userId: actor.id ?? "system" });
  return { message: `${result.label} wurde endgültig gelöscht (${result.count} Einsatz/Einsätze entfernt).` };
}
