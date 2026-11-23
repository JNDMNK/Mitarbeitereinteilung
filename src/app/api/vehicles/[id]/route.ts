import { vehicleUpdateSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { updateVehicle } from "@/server/services/masterdata/vehicles";

export const PATCH = apiRoute<{ id: string }>({ permission: "masterdata.edit" }, async ({ req, params, session }) => {
  const input = await parseJson(req, vehicleUpdateSchema);
  return { vehicle: await updateVehicle(session.user.id, params.id, input) };
});
