import { outageUpdateSchema, versionSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { deleteOutage, updateOutage } from "@/server/services/vehicle-outages";

export const PATCH = apiRoute<{ id: string }>({ permission: "planning.edit" }, async ({ req, params, session }) => {
  const input = await parseJson(req, outageUpdateSchema);
  return updateOutage(session.user.id, params.id, input);
});

export const DELETE = apiRoute<{ id: string }>({ permission: "planning.edit" }, async ({ req, params, session }) => {
  const { version } = await parseJson(req, versionSchema);
  return deleteOutage(session.user.id, params.id, version);
});
