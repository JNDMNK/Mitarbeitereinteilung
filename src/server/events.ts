import "server-only";
import { EventEmitter } from "node:events";

/** Änderungs-Ereignisse für Echtzeit-Updates (ein Prozess = ein Container) */
export type ChangeEvent = {
  /** betroffene Bereiche, z. B. "planning", "absences", "masterdata" */
  scope: "planning" | "absences" | "masterdata";
  /** betroffene Tage (für gezieltes Neuladen) */
  dates?: string[];
  userId: string;
  at: number;
};

const g = globalThis as unknown as { changeBus?: EventEmitter };
export const changeBus = (g.changeBus ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(500);
  return e;
})());

export function publishChange(event: Omit<ChangeEvent, "at">) {
  changeBus.emit("change", { ...event, at: Date.now() } satisfies ChangeEvent);
}
