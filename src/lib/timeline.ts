import { findOverlap } from "./planning-logic";
import { DAY_MINUTES, SLOT_MINUTES } from "./time";

export type DragMode = "move" | "start" | "end";
export type Interval = { startMin: number; endMin: number };

/** Sichtbarer Bereich der Zeitachse: Standard 05:00–20:00, erweitert um alle Einsätze (volle Stunden) */
export function computeAxis(intervals: Interval[], defaultStart: number, defaultEnd: number): Interval {
  let start = Math.min(5 * 60, defaultStart - 60);
  let end = Math.max(20 * 60, defaultEnd + 60);
  for (const i of intervals) {
    start = Math.min(start, i.startMin);
    end = Math.max(end, i.endMin);
  }
  return { startMin: Math.max(0, Math.floor(start / 60) * 60), endMin: Math.min(DAY_MINUTES, Math.ceil(end / 60) * 60) };
}

/** Pixelverschiebung in Minuten umrechnen, auf 15-Minuten-Raster gerundet */
export function pxToMinutes(dx: number, pxPerMinute: number): number {
  if (pxPerMinute <= 0) return 0;
  return Math.round(dx / pxPerMinute / SLOT_MINUTES) * SLOT_MINUTES;
}

/** Neues Zeitfenster nach Ziehen/Größenänderung (Raster, Mindestdauer 15 Min., innerhalb 00:00–24:00) */
export function applyDrag(orig: Interval, mode: DragMode, delta: number): Interval {
  if (mode === "move") {
    const len = orig.endMin - orig.startMin;
    const start = Math.min(Math.max(0, orig.startMin + delta), DAY_MINUTES - len);
    return { startMin: start, endMin: start + len };
  }
  if (mode === "start") {
    const start = Math.min(Math.max(0, orig.startMin + delta), orig.endMin - SLOT_MINUTES);
    return { startMin: start, endMin: orig.endMin };
  }
  const end = Math.max(Math.min(DAY_MINUTES, orig.endMin + delta), orig.startMin + SLOT_MINUTES);
  return { startMin: orig.startMin, endMin: end };
}

/** Überschneidet das neue Fenster einen anderen Einsatz derselben Zeile? */
export function collides<T extends Interval & { id: string }>(others: T[], selfId: string, next: Interval): T | undefined {
  return findOverlap(
    others.filter((o) => o.id !== selfId),
    next.startMin,
    next.endMin,
  );
}

/** Position in Prozent der Achse */
export function toPercent(min: number, axis: Interval): number {
  return ((min - axis.startMin) / (axis.endMin - axis.startMin)) * 100;
}
