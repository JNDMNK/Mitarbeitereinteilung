import { diffDays } from "@/lib/dates";
import { planningQuerySchema } from "@/lib/planning-schemas";
import { apiRoute } from "@/server/api";
import { badRequest } from "@/server/errors";
import { getPlanningData } from "@/server/services/planning";

export const GET = apiRoute({ permission: "planning.view" }, async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = planningQuerySchema.parse({ from: sp.get("from"), to: sp.get("to") });
  if (to < from || diffDays(from, to) > 31) throw badRequest("Ungültiger Zeitraum.");
  return getPlanningData(from, to);
});
