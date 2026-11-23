import { PLANNING_ACTIONS, type PlanningAction } from "@/lib/planning-schemas";
import { apiRoute, parseJson } from "@/server/api";
import { notFound } from "@/server/errors";
import {
  assignCrew,
  createAssignment,
  deleteAssignment,
  releaseVehicle,
  removeCrew,
  updateAssignment,
} from "@/server/services/planning";

/* eslint-disable @typescript-eslint/no-explicit-any -- Schema und Handler sind über die Tabelle gekoppelt */
const HANDLERS: Record<PlanningAction, (actorId: string, input: any) => Promise<unknown>> = {
  "crew-assign": assignCrew,
  "crew-remove": removeCrew,
  "assignment-create": createAssignment,
  "assignment-update": updateAssignment,
  "assignment-delete": deleteAssignment,
  "vehicle-release": releaseVehicle,
};

export const POST = apiRoute<{ action: string }>({ permission: "planning.edit" }, async ({ req, params, session }) => {
  const action = params.action as PlanningAction;
  if (!(action in PLANNING_ACTIONS)) throw notFound("Unbekannte Aktion.");
  const input = await parseJson(req, PLANNING_ACTIONS[action] as any);
  return HANDLERS[action](session.user.id, input);
});
