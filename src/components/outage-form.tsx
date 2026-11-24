"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { api, ApiClientError } from "@/lib/api-client";
import { OUTAGE_REASON_LABELS, OUTAGE_REASONS } from "@/lib/constants";
import { formatDayShort } from "@/lib/dates";

export type OutageValue = { id: string; vehicleId: string; startDate: string; endDate: string; reason: string; note: string | null; version: number };
type Planned = { days: string[]; people: number; assignments: number };

/**
 * Ausfall (Werkstatt, TÜV …) eintragen oder ändern. Ist das Fahrzeug im Zeitraum
 * schon eingeteilt, wird nachgefragt, ob die Einteilung entfernt werden soll.
 */
export function OutageForm({
  vehicle,
  outage,
  defaultStart,
  defaultEnd,
  onDone,
  onCancel,
}: {
  vehicle: { id: string; licensePlate: string; name: string };
  outage?: OutageValue | null;
  defaultStart?: string;
  defaultEnd?: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [startDate, setStart] = useState(outage?.startDate ?? defaultStart ?? "");
  const [endDate, setEnd] = useState(outage?.endDate ?? defaultEnd ?? defaultStart ?? "");
  const [reason, setReason] = useState(outage?.reason ?? "WORKSHOP");
  const [note, setNote] = useState(outage?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState<Planned | null>(null);

  async function save(clearPlanning = false) {
    setBusy(true);
    setError(null);
    try {
      const body = { startDate, endDate, reason, note: note.trim() || null, clearPlanning };
      const res = outage
        ? await api<{ message: string }>(`/api/vehicle-outages/${outage.id}`, { method: "PATCH", body: { ...body, version: outage.version } })
        : await api<{ message: string }>("/api/vehicle-outages", { body: { ...body, vehicleId: vehicle.id } });
      onDone(res.message);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "vehicle_planned") {
        setPlanned(err.details as Planned);
        setError(err.message);
      } else {
        setError(err instanceof ApiClientError ? err.message : "Speichern fehlgeschlagen.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!outage || !confirm(`Ausfall von ${vehicle.licensePlate} löschen? Das Fahrzeug ist dann wieder verfügbar.`)) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>(`/api/vehicle-outages/${outage.id}`, { method: "DELETE", body: { version: outage.version } });
      onDone(res.message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Löschen fehlgeschlagen.");
      setBusy(false);
    }
  }

  if (planned) {
    return (
      <div className="space-y-4">
        <Alert tone="warning">{error}</Alert>
        <p className="text-sm">
          Betroffene Tage: <strong>{planned.days.map(formatDayShort).join(", ")}</strong>
        </p>
        <p className="text-sm text-muted">Die Besatzung kommt an diesen Tagen zurück in den Pool, Baustellen-Einsätze des Fahrzeugs werden entfernt.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => setPlanned(null)}>
            Zurück
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void save(true)}>
            Besatzung zurück in den Pool &amp; speichern
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-muted">
        <strong className="font-mono text-ink">{vehicle.licensePlate}</strong> {vehicle.name} ist in diesem Zeitraum nicht planbar.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="von">
          <Input
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStart(e.target.value);
              if (!endDate || endDate < e.target.value) setEnd(e.target.value);
            }}
          />
        </Field>
        <Field label="bis (einschließlich)">
          <Input type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Grund">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {OUTAGE_REASONS.map((r) => (
            <option key={r} value={r}>
              {OUTAGE_REASON_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notiz (optional)" hint="z. B. „Bremsen, Autohaus Müller“">
        <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {outage && (
            <Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}>
              Ausfall löschen
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Speichern …" : "Speichern"}
          </Button>
        </div>
      </div>
    </form>
  );
}
