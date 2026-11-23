"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useState, type ReactNode } from "react";

export type DragData =
  | { type: "employee"; date: string; employeeId: string; fromVehicleId: string | null }
  | {
      type: "vehicle";
      date: string;
      vehicleId: string;
      /** Quell-Einsatz (null = aus dem Pool) */
      assignmentId: string | null;
      assignmentVersion: number | null;
      siteId: string | null;
      startMin: number | null;
      endMin: number | null;
      vdVersion: number | null;
    };

export type DropData =
  | { kind: "vehicle"; accepts: "employee"; date: string; vehicleId: string }
  | { kind: "site"; accepts: "vehicle"; date: string; siteId: string }
  | { kind: "pool"; accepts: "both"; date: string };

const accepts = (drop: DropData, drag: DragData) => drop.accepts === "both" || drop.accepts === drag.type;

/** Nur passende Ziele unter dem Zeiger; bei Verschachtelung gewinnt das kleinste (innerste) */
const collision: CollisionDetection = (args) => {
  const drag = args.active.data.current as DragData | undefined;
  if (!drag) return [];
  const containers = args.droppableContainers.filter((c) => {
    const d = c.data.current as DropData | undefined;
    return d && accepts(d, drag);
  });
  const hits = pointerWithin({ ...args, droppableContainers: containers });
  const area = (id: string | number) => {
    const r = args.droppableRects.get(id);
    return r ? r.width * r.height : Infinity;
  };
  return hits.sort((a, b) => area(a.id) - area(b.id));
};

export function PlanningDnd({
  enabled,
  children,
  onDrop,
  renderOverlay,
  onDraggingChange,
}: {
  enabled: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  children: ReactNode;
  onDrop: (drag: DragData, drop: DropData, copy: boolean) => void;
  renderOverlay: (drag: DragData, copy: boolean) => ReactNode;
}) {
  const [active, setActive] = useState<DragData | null>(null);
  const [copy, setCopy] = useState(false);
  // Maus: ab 6 px Bewegung ziehen (Klick bleibt Klick). Touch: lange drücken (250 ms).
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } });
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } });
  const editSensors = useSensors(mouse, touch);
  const noSensors = useSensors();
  const sensors = enabled ? editSensors : noSensors;

  // Strg/Alt während des Ziehens = kopieren
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => setCopy(e.ctrlKey || e.altKey || e.metaKey);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [active]);

  return (
    <DndContext
      // feste ID: sonst unterscheiden sich die aria-IDs zwischen Server und Browser (Hydration)
      id="planning-dnd"
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e: DragStartEvent) => {
        onDraggingChange?.(true);
        setActive(e.active.data.current as DragData);
        const ev = e.activatorEvent as MouseEvent | undefined;
        setCopy(!!(ev && (ev.ctrlKey || ev.altKey || ev.metaKey)));
      }}
      onDragCancel={() => {
        onDraggingChange?.(false);
        setActive(null);
      }}
      onDragEnd={(e: DragEndEvent) => {
        onDraggingChange?.(false);
        const drag = e.active.data.current as DragData | undefined;
        const drop = e.over?.data.current as DropData | undefined;
        setActive(null);
        if (drag && drop && accepts(drop, drag)) onDrop(drag, drop, copy);
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>{active ? <div className="cursor-grabbing">{renderOverlay(active, copy)}</div> : null}</DragOverlay>
    </DndContext>
  );
}

/** Ziehbares Element; `disabled` für Nur-Lesen */
export function useDragItem(id: string, data: DragData, disabled: boolean) {
  const d = useDraggable({ id, data, disabled });
  return {
    ref: d.setNodeRef,
    props: disabled ? {} : { ...d.listeners, ...d.attributes, role: undefined, "aria-roledescription": "ziehbar" },
    isDragging: d.isDragging,
  };
}

/** Ablageziel; liefert Hervorhebung, wenn etwas Passendes darüber gezogen wird */
export function useDropZone(id: string, data: DropData, disabled: boolean) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data, disabled });
  const drag = active?.data.current as DragData | undefined;
  const canDrop = !!drag && accepts(data, drag);
  return { ref: setNodeRef, isOver: isOver && canDrop, canDrop };
}

/** true, solange irgendetwas gezogen wird */
export function useIsDragging() {
  return !!useDndContext().active;
}

export function dropZoneClass(z: { isOver: boolean; canDrop: boolean }) {
  if (z.isOver) return "ring-4 ring-brand-600 bg-brand-50";
  if (z.canDrop) return "outline-2 outline-dashed outline-brand-600/40";
  return "";
}
