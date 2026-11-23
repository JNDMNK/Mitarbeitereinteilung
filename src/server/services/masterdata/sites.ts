import "server-only";
import type { z } from "zod";
import { SITE_STATUS_LABELS, type SiteStatus } from "@/lib/constants";
import type { siteCreateSchema, siteUpdateSchema } from "@/lib/masterdata-schemas";
import { audit } from "../../audit";
import { db } from "../../db";
import { badRequest, conflict, notFound } from "../../errors";
import { describeChanges, summaryWith } from "./changes";

export function listSites() {
  return db.site.findMany({
    orderBy: [{ active: "desc" }, { status: "asc" }, { name: "asc" }],
  });
}

const fmtDate = (v: unknown) => (typeof v === "string" && v ? v.split("-").reverse().join(".") : "–");

export async function createSite(actorId: string, input: z.infer<typeof siteCreateSchema>) {
  return db.$transaction(async (tx) => {
    const s = await tx.site.create({ data: input });
    await audit(tx, { userId: actorId, action: "site.create", entityType: "Site", entityId: s.id, summary: `Baustelle "${s.name}" angelegt` });
    return s;
  });
}

export async function updateSite(actorId: string, id: string, input: z.infer<typeof siteUpdateSchema>) {
  const { version, ...data } = input;
  return db.$transaction(async (tx) => {
    const cur = await tx.site.findUnique({ where: { id } });
    if (!cur) throw notFound("Baustelle nicht gefunden.");
    const start = data.startDate === undefined ? cur.startDate : data.startDate;
    const end = data.endDate === undefined ? cur.endDate : data.endDate;
    if (start && end && start > end) throw badRequest("Das Ende darf nicht vor dem Beginn liegen.");

    const res = await tx.site.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (res.count !== 1) throw conflict();
    const changes = describeChanges(
      cur,
      data,
      { name: "Name", address: "Adresse", customer: "Kunde", orderNumber: "Auftragsnr.", startDate: "Beginn", endDate: "Ende", status: "Status", note: "Notiz", color: "Farbe", active: "Aktiv" },
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
}
