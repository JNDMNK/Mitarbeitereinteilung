import { vehicleUpdateSchema } from "@/lib/masterdata-schemas";
import { versionSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { updateVehicle } from "@/server/services/masterdata/vehicles";
import { deleteVehicle } from "@/server/services/masterdata/vehicles";

export const PATCH = apiRoute<{ id: string }>({ permission: "masterdata.edit" }, async ({ req, params, session }) => {
  const input = await parseJson(req, vehicleUpdateSchema);
  return { vehicle: await updateVehicle(session.user.id, params.id, input) };
});

/** Endgültig löschen – nur Admin, nur deaktivierte Einträge */
export const DELETE = apiRoute<{ id: string }>({ permission: "admin.masterdata" }, async ({ req, params, session }) => {
  const { version } = await parseJson(req, versionSchema);
  return deleteVehicle(session.user.id, params.id, version);
});
