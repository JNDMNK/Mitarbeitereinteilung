"use client";

import type { LiveStatus } from "./live-events";

const STYLE: Record<LiveStatus, { dot: string; text: string; title: string }> = {
  live: { dot: "bg-green-600", text: "Live", title: "Änderungen anderer erscheinen sofort." },
  connecting: { dot: "bg-amber-500 animate-pulse", text: "Verbinde …", title: "Live-Verbindung wird aufgebaut." },
  offline: { dot: "bg-red-600", text: "Offline", title: "Keine Live-Verbindung – die Ansicht wird alle 20 Sekunden aktualisiert." },
};

export function LiveIndicator({ status }: { status: LiveStatus }) {
  const s = STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted" title={s.title} aria-live="polite">
      <span className={`size-2.5 rounded-full ${s.dot}`} aria-hidden />
      {s.text}
    </span>
  );
}
