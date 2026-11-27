"use client";

/* eslint-disable @next/next/no-img-element -- Vorschau des hochgeladenen Logos */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { api, ApiClientError, apiUpload } from "@/lib/api-client";
import { formatMinutes, gridOptions } from "@/lib/time";

type Msg = { tone: "success" | "error"; text: string } | null;
const errText = (err: unknown, fallback: string) => (err instanceof ApiClientError ? err.message : fallback);

export function SettingsForm(props: { version: number; companyName: string; defaultStartMin: number; defaultEndMin: number; weekCrews: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const times = gridOptions(4 * 60, 22 * 60);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setMsg(null);
        try {
          await api("/api/settings", {
            method: "PATCH",
            body: {
              version: props.version,
              companyName: f.get("companyName"),
              defaultStartMin: Number(f.get("defaultStartMin")),
              defaultEndMin: Number(f.get("defaultEndMin")),
              weekCrews: f.get("weekCrews") === "on",
            },
          });
          setMsg({ tone: "success", text: "Einstellungen gespeichert." });
          router.refresh();
        } catch (err) {
          setMsg({ tone: "error", text: errText(err, "Speichern fehlgeschlagen.") });
        } finally {
          setBusy(false);
        }
      }}
    >
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Field label="Firmenname" hint="Erscheint in der Kopfzeile, auf der Anmeldeseite und im Ausdruck.">
        <Input name="companyName" defaultValue={props.companyName} required maxLength={80} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Standard-Arbeitsbeginn">
          <Select name="defaultStartMin" defaultValue={props.defaultStartMin}>
            {times.map((t) => (
              <option key={t} value={t}>
                {formatMinutes(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Standard-Arbeitsende">
          <Select name="defaultEndMin" defaultValue={props.defaultEndMin}>
            {times.map((t) => (
              <option key={t} value={t}>
                {formatMinutes(t)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-sm text-muted">Wird bei neuen Baustelleneinsätzen als Zeitfenster vorgeschlagen.</p>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="weekCrews" defaultChecked={props.weekCrews} className="mt-1 size-5 shrink-0 accent-brand-600" />
        <span>
          <span className="font-semibold">Wochen-Kolonnen</span>
          <span className="block text-sm text-muted">
            Wer am ersten Arbeitstag der Woche (meist Montag) auf ein Fahrzeug eingeteilt wird, fährt automatisch die restliche Woche in derselben Kolonne – außer Praktikanten, Abwesende und
            Räume. Spätere Änderungen am Montag werden mitgezogen, manuell geänderte Tage bleiben unangetastet.
          </span>
        </span>
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? "Speichern …" : "Speichern"}
      </Button>
    </form>
  );
}

export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > 1024 * 1024) {
      setMsg({ tone: "error", text: "Das Logo darf höchstens 1 MB groß sein." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.append("logo", file);
    try {
      await apiUpload("/api/settings/logo", form);
      setMsg({ tone: "success", text: "Logo gespeichert." });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "error", text: errText(err, "Hochladen fehlgeschlagen.") });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex min-h-32 items-center justify-center rounded-lg border-2 border-dashed border-line bg-slate-50 p-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Aktuelles Firmenlogo" className="max-h-28 max-w-full object-contain" />
        ) : (
          <span className="text-muted">Noch kein Logo hochgeladen</span>
        )}
      </div>
      <p className="text-sm text-muted">PNG, JPG oder WebP, höchstens 1 MB. Am besten quer und mit transparentem oder weißem Hintergrund.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        id="logo-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Hochladen …" : logoUrl ? "Logo ersetzen" : "Logo hochladen"}
        </Button>
        {logoUrl && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Logo wirklich entfernen?")) return;
              try {
                await api("/api/settings/logo", { method: "DELETE" });
                setMsg({ tone: "success", text: "Logo entfernt." });
                router.refresh();
              } catch (err) {
                setMsg({ tone: "error", text: errText(err, "Entfernen fehlgeschlagen.") });
              }
            }}
          >
            Logo entfernen
          </Button>
        )}
      </div>
    </div>
  );
}

export function CleanupForm(props: { version: number; autoDeleteSiteDays: number; autoDeleteEmployeeDays: number; autoDeleteVehicleDays: number; planningRetentionYears: number; absenceRetentionYears: number; auditRetentionYears: number; lastVacuumAt: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const fields = [
    { name: "autoDeleteSiteDays", label: "Baustellen und freie Einträge", value: props.autoDeleteSiteDays },
    { name: "autoDeleteEmployeeDays", label: "Mitarbeiter", value: props.autoDeleteEmployeeDays },
    { name: "autoDeleteVehicleDays", label: "Fahrzeuge und Räume", value: props.autoDeleteVehicleDays },
  ] as const;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setMsg(null);
        try {
          const res = await api<{ result: { sites: number; employees: number; vehicles: number; planningDays: number; absences: number; auditEntries: number; freeSites: number; errors: string[] } }>("/api/settings/cleanup", {
            method: "PATCH",
            body: {
              version: props.version,
              ...Object.fromEntries(fields.map((x) => [x.name, Number(f.get(x.name))])),
              planningRetentionYears: Number(f.get("planningRetentionYears")),
              absenceRetentionYears: Number(f.get("absenceRetentionYears")),
              auditRetentionYears: Number(f.get("auditRetentionYears")),
            },
          });
          const r = res.result;
          const total = r.sites + r.employees + r.vehicles;
          setMsg({
            tone: r.errors.length ? "error" : "success",
            text:
              `Gespeichert.${total ? ` Sofort gelöscht: ${r.sites} Baustelle(n), ${r.employees} Mitarbeiter, ${r.vehicles} Fahrzeug(e)/Räume.` : ""}` +
              (r.planningDays ? ` Alte Planung gelöscht: ${r.planningDays} Fahrzeug-Tage.` : "") +
              (r.absences ? ` Alte Abwesenheiten gelöscht: ${r.absences}.` : "") +
              (r.freeSites ? ` Ungenutzte freie Einträge gelöscht: ${r.freeSites}.` : "") +
              (r.auditEntries ? ` Alte Protokolleinträge gelöscht: ${r.auditEntries}.` : "") +
              (r.errors.length ? ` Nicht gelöscht: ${r.errors.join("; ")}` : ""),
          });
          router.refresh();
        } catch (err) {
          setMsg({ tone: "error", text: errText(err, "Speichern fehlgeschlagen.") });
        } finally {
          setBusy(false);
        }
      }}
    >
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <p className="text-sm text-muted">
        Deaktivierte Einträge werden nach so vielen Tagen automatisch endgültig gelöscht – inklusive ihrer Einteilungen und Einsätze. <strong>0 = nie automatisch löschen.</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map((x) => (
          <Field key={x.name} label={x.label} hint="Tage nach Deaktivierung">
            <Input name={x.name} type="number" min={0} max={3650} step={1} inputMode="numeric" defaultValue={x.value} required />
          </Field>
        ))}
      </div>
      <div className="rounded-lg border border-line p-3">
        <p className="mb-2 font-semibold">Alte Daten löschen (damit die Datenbank nicht über die Jahre wächst)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["planningRetentionYears", "Planung (Einsätze, Besatzung)", props.planningRetentionYears],
              ["absenceRetentionYears", "Abwesenheiten", props.absenceRetentionYears],
              ["auditRetentionYears", "Änderungsprotokoll", props.auditRetentionYears],
            ] as const
          ).map(([name, label, value]) => (
            <Field key={name} label={label}>
              <Select name={name} defaultValue={value}>
                <option value={1}>nach 1 Jahr</option>
                <option value={2}>nach 2 Jahren</option>
                <option value={3}>nach 3 Jahren</option>
              </Select>
            </Field>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Abwesenheiten zählen ab ihrem Ende. Freie Einträge (Baustellen aus der Planung), die nirgends mehr eingeplant sind und seit 30 Tagen unverändert, werden mit entfernt. Stammdaten
          bleiben erhalten. Einmal im Monat wird die Datenbankdatei nachts verdichtet
          {props.lastVacuumAt ? ` (zuletzt ${new Date(props.lastVacuumAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})` : ""}.
        </p>
      </div>
      <p className="text-sm text-muted">Geprüft wird beim Start und danach alle 6 Stunden. Jede Löschung steht im Änderungsprotokoll.</p>
      <Button type="submit" disabled={busy}>
        {busy ? "Speichern …" : "Speichern"}
      </Button>
    </form>
  );
}
