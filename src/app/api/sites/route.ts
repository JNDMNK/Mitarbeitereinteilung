import { siteCreateSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { createSite, listSites } from "@/server/services/masterdata/sites";

// Lesen: alle eingeloggten Benutzer (wird für Planung/Anzeige gebraucht)
export const GET = apiRoute({ permission: "planning.view" }, async () => ({ sites: await listSites() }));

export const POST = apiRoute({ permission: "masterdata.edit" }, async ({ req, session }) => {
  const input = await parseJson(req, siteCreateSchema);
  return { site: await createSite(session.user.id, input) };
});
