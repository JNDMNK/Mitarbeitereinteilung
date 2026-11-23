"use client";

import { useRef } from "react";

/**
 * Waagrechtes Wischen erkennen (nur Touch). Ignoriert:
 *  - Gesten, die in [data-no-swipe] beginnen (z. B. waagrecht scrollbare Zeitleiste),
 *  - langsame Gesten (> 600 ms, z. B. langes Drücken für Drag & Drop),
 *  - eher senkrechte Bewegungen (normales Scrollen).
 */
export function useSwipe({ onLeft, onRight, disabled }: { onLeft: () => void; onRight: () => void; disabled?: () => boolean }) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart(e: React.TouchEvent) {
      const target = e.target as HTMLElement;
      if (e.touches.length !== 1 || target.closest("[data-no-swipe]") || disabled?.()) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    },
    onTouchEnd(e: React.TouchEvent) {
      const s = start.current;
      start.current = null;
      if (!s || disabled?.()) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Date.now() - s.t > 600 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}
