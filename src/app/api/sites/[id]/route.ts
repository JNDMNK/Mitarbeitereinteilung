import { siteUpdateSchema, versionSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { deleteSite, updateSite } from "@/server/services/masterdata/sites";

export const PATCH = apiRoute<{ id: string }>({ permission: "masterdata.edit" }, async ({ req, params, session }) => {
  const input = await parseJson(req, siteUpdateSchema);
  return { site: await updateSite(session.user.id, params.id, input) };
});

/** Endgültig löschen – nur deaktivierte; feste Baustellen nur Admin (Prüfung im Service) */
export const DELETE = apiRoute<{ id: string }>({ permission: "masterdata.edit" }, async ({ req, params, session }) => {
  const { version } = await parseJson(req, versionSchema);
  return deleteSite({ id: session.user.id, role: session.user.role }, params.id, version);
});
