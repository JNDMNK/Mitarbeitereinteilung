import { vehicleCreateSchema } from "@/lib/masterdata-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { createVehicle, listVehicles } from "@/server/services/masterdata/vehicles";

// Lesen: alle eingeloggten Benutzer (wird für Planung/Anzeige gebraucht)
export const GET = apiRoute({ permission: "planning.view" }, async () => ({ vehicles: await listVehicles() }));

export const POST = apiRoute({ permission: "masterdata.edit" }, async ({ req, session }) => {
  const input = await parseJson(req, vehicleCreateSchema);
  return { vehicle: await createVehicle(session.user.id, input) };
});
