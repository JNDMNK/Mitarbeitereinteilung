"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";

export function PreferencesForm({ hideWeekends: initial }: { hideWeekends: boolean }) {
  const [hideWeekends, setHideWeekends] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        className="size-6 accent-brand-600"
        checked={hideWeekends}
        onChange={async (e) => {
          const value = e.target.checked;
          setHideWeekends(value);
          try {
            await api("/api/auth/prefs", { method: "PATCH", body: { hideWeekends: value } });
            setStatus("Gespeichert");
          } catch {
            setHideWeekends(!value);
            setStatus("Speichern fehlgeschlagen");
          }
        }}
      />
      <span>
        Samstag und Sonntag in der Planung ausblenden
        {status && <span className="ml-2 text-sm text-muted">({status})</span>}
      </span>
    </label>
  );
}
