"use client";

import type { Toast } from "./use-planning";

const TONE = {
  success: "border-green-600 bg-green-50 text-green-950",
  warning: "border-amber-500 bg-amber-50 text-amber-950",
  error: "border-red-600 bg-red-50 text-red-950",
};
const ICON = { success: "✓", warning: "⚠", error: "✕" };

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="no-print pointer-events-none fixed inset-x-2 bottom-20 z-50 flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:items-end" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border-l-8 p-3 shadow-xl ${TONE[t.tone]}`}>
          <span className="text-xl leading-6 font-bold" aria-hidden>
            {ICON[t.tone]}
          </span>
          <div className="flex-1 space-y-0.5 text-sm font-medium">
            {t.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
          <button type="button" onClick={() => onDismiss(t.id)} className="-m-1 rounded p-1 text-lg leading-none opacity-70 hover:opacity-100" aria-label="Schließen">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
