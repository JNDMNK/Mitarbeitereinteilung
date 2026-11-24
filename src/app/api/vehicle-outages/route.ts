import { outageCreateSchema, outageQuerySchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { badRequest } from "@/server/errors";
import { createOutage, listOutages } from "@/server/services/vehicle-outages";

export const GET = apiRoute({ permission: "planning.view" }, async ({ req }) => {
  const url = new URL(req.url);
  const q = outageQuerySchema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!q.success) throw badRequest("Bitte Zeitraum angeben.");
  return { outages: await listOutages(q.data.from, q.data.to) };
});

export const POST = apiRoute({ permission: "planning.edit" }, async ({ req, session }) => {
  const input = await parseJson(req, outageCreateSchema);
  return createOutage(session.user.id, input);
});
