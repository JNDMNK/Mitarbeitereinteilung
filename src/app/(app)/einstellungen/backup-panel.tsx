"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiUpload } from "@/lib/api-client";

type BackupFile = { name: string; label: string; size: number; createdAt: string };

const sizeText = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function BackupPanel({ files }: { files: BackupFile[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function restore() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await apiUpload<{ before: string; migrated: string[] }>("/api/backup/import", form);
      setMsg({
        tone: "success",
        text: `Sicherung eingespielt. Der vorherige Stand wurde als „${res.before}“ gesichert${res.migrated.length ? `, ${res.migrated.length} Datenbank-Aktualisierung(en) ergänzt` : ""}. Sie werden gleich zur Anmeldung weitergeleitet.`,
      });
      // Voller Neustart: Sitzungen stammen jetzt aus der Sicherung
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      setTimeout(() => window.location.assign("/login"), 4000);
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof ApiClientError ? err.message : "Einspielen fehlgeschlagen." });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div>
        <h3 className="mb-1 font-bold">Sicherung herunterladen</h3>
        <p className="mb-2 text-sm text-muted">Enthält alle Daten (Mitarbeiter, Fahrzeuge, Baustellen, Einteilung, Abwesenheiten, Benutzer). Das Logo ist nicht enthalten.</p>
        <a href="/api/backup/export" className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700">
          ⬇ Jetzt sichern &amp; herunterladen
        </a>
      </div>

      <div>
        <h3 className="mb-1 font-bold">Vorhandene Sicherungen auf dem Server</h3>
        <p className="mb-2 text-sm text-muted">Täglich automatisch (letzte 14 Tage) unter <code>/data/backups</code> – zusätzlich den Ordner extern sichern (z. B. Unraid-Plugin „Appdata Backup“).</p>
        {files.length === 0 ? (
          <p className="text-muted">Noch keine Sicherungen vorhanden. Die erste automatische Sicherung entsteht kurz nach dem Start.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
            {files.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="flex-1 font-semibold">{f.label}</span>
                <span className="text-sm text-muted">{sizeText(f.size)}</span>
                <a href={`/api/backup/files/${encodeURIComponent(f.name)}`} className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                  Herunterladen
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border-2 border-red-300 p-3">
        <h3 className="mb-1 font-bold text-red-800">Sicherung einspielen</h3>
        <p className="mb-2 text-sm">
          Ersetzt <strong>alle aktuellen Daten</strong> durch den Stand der Sicherung. Der aktuelle Stand wird vorher automatisch gesichert. Danach müssen sich alle neu anmelden.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".db,application/vnd.sqlite3,application/octet-stream"
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:font-semibold"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setUnderstood(false);
          }}
        />
        {file && (
          <div className="mt-3 space-y-3">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 size-5 accent-red-700" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>
                Ich möchte „{file.name}“ ({sizeText(file.size)}) einspielen und alle aktuellen Daten ersetzen.
              </span>
            </label>
            <Button variant="danger" disabled={!understood || busy} onClick={restore}>
              {busy ? "Wird eingespielt …" : "Sicherung jetzt einspielen"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
